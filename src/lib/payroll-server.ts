/**
 * Server-side glue between the Prisma layer and the pure calculation engine
 * in `src/lib/payroll.ts`. Loads rules + adjustments + compensation for an
 * employee + period and produces an engine-ready CalcInputs.
 */

import { prisma } from "@/lib/prisma"
import {
  calculatePayslip,
  toMinor,
  type CalcInputs,
  type PayrollRule,
  type PayrollAdjustment,
  type PayslipDraft,
  type Bracket,
} from "@/lib/payroll"

type DbRule = {
  id: string
  enabled: boolean
  calculationType: string
  fixedAmount: { toString: () => string } | null
  percentage: { toString: () => string } | null
  formula: string | null
  minAmount: { toString: () => string } | null
  maxAmount: { toString: () => string } | null
  sortOrder: number
  component: {
    code: string
    name: string
    type: string
    isTaxable: boolean
  }
  brackets: {
    minAmount: { toString: () => string }
    maxAmount: { toString: () => string } | null
    rate: { toString: () => string }
    sortOrder: number
  }[]
}

function decToMinor(d: { toString: () => string } | null | undefined): number | undefined {
  if (d == null) return undefined
  const n = Number(d.toString())
  return Number.isFinite(n) ? Math.round(n * 100) : undefined
}

function decToFloat(d: { toString: () => string } | null | undefined): number | undefined {
  if (d == null) return undefined
  const n = Number(d.toString())
  return Number.isFinite(n) ? n : undefined
}

/** Map a DB CountryPayrollRule (with brackets + component) to the engine shape. */
export function ruleFromDb(row: DbRule): PayrollRule {
  const brackets: Bracket[] = row.brackets
    .map((b) => ({
      minAmount: decToMinor(b.minAmount) ?? 0,
      maxAmount: b.maxAmount ? decToMinor(b.maxAmount) ?? null : null,
      rate: decToFloat(b.rate) ?? 0,
    }))
    .sort((a, b) => a.minAmount - b.minAmount)

  return {
    componentCode: row.component.code,
    componentName: row.component.name,
    componentType: row.component.type as PayrollRule["componentType"],
    isTaxable: row.component.isTaxable,
    enabled: row.enabled,
    calculationType: row.calculationType as PayrollRule["calculationType"],
    fixedAmount: decToMinor(row.fixedAmount),
    percentage: decToFloat(row.percentage),
    formula: row.formula ?? undefined,
    brackets: brackets.length > 0 ? brackets : undefined,
    minAmount: decToMinor(row.minAmount),
    maxAmount: decToMinor(row.maxAmount),
    sortOrder: row.sortOrder,
  }
}

/**
 * Resolve a fully-populated CalcInputs for an employee + period:
 *   - employee's EmployeeCompensation (base, currency, overrides)
 *   - country rules + brackets for the org × employee's country
 *   - one-off adjustments for the period
 *
 * Throws if the employee has no compensation set up.
 */
export async function buildCalcInputs(
  employeeId: string,
  period: string, // YYYY-MM
  opts?: { workingDays?: number; paidDays?: number }
): Promise<{
  inputs: CalcInputs
  countryCode: string
  currency: string
  organizationId: string
  costCenterId: string | null
}> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    include: {
      compensation: true,
      organization: { select: { id: true, countryCode: true } },
      costCenter: { select: { id: true, countryCode: true, currency: true } },
    },
  })
  if (!employee) throw new Error("Employee not found")
  if (!employee.organizationId || !employee.organization) {
    throw new Error("Employee has no organization")
  }
  if (!employee.compensation) {
    throw new Error("Employee has no compensation profile — set base salary first")
  }

  // Country resolution: cost-center wins (e.g. Vietnam CC inside an
  // Indonesia-HQ org), org country is the fallback.
  const countryCode = employee.costCenter?.countryCode ?? employee.organization.countryCode
  const costCenterId = employee.costCenterId

  // Rule resolution: per-CC rules override org-wide fallbacks for the
  // same componentId. Load both buckets, then merge keeping the CC row
  // when both exist.
  const ruleRows = await prisma.countryPayrollRule.findMany({
    where: {
      organizationId: employee.organizationId,
      OR: [
        { costCenterId: costCenterId ?? "__never_matches__" },
        { costCenterId: null },
      ],
    },
    include: {
      component: { select: { code: true, name: true, type: true, isTaxable: true } },
      brackets: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sortOrder: "asc" },
  })

  // Merge: keep CC-specific rule when present, otherwise the org-wide one.
  const byComponent = new Map<string, (typeof ruleRows)[number]>()
  for (const r of ruleRows) {
    const prev = byComponent.get(r.componentId)
    if (!prev) byComponent.set(r.componentId, r)
    else if (prev.costCenterId == null && r.costCenterId != null) byComponent.set(r.componentId, r)
  }
  const rules = [...byComponent.values()].map(ruleFromDb)

  const adjustmentRows = await prisma.payrollAdjustment.findMany({
    where: { employeeId, period },
  })
  const adjustments: PayrollAdjustment[] = adjustmentRows.map((a) => ({
    componentCode: a.componentCode,
    amount: Math.round(Number(a.amount.toString()) * 100),
    description: a.description ?? undefined,
  }))

  // componentOverrides JSON is stored in major units; convert to minor.
  const rawOverrides = (employee.compensation.componentOverrides ?? null) as Record<string, number> | null
  const componentOverrides: Record<string, number> | undefined = rawOverrides
    ? Object.fromEntries(Object.entries(rawOverrides).map(([k, v]) => [k, toMinor(v)]))
    : undefined

  const inputs: CalcInputs = {
    baseSalary: toMinor(Number(employee.compensation.baseSalary.toString())),
    rules,
    adjustments,
    componentOverrides,
    workingDays: opts?.workingDays ?? employee.compensation.workingDaysPerMonth,
    paidDays: opts?.paidDays,
  }

  return {
    inputs,
    countryCode,
    currency: employee.compensation.currency,
    organizationId: employee.organizationId,
    costCenterId,
  }
}

/** Run the engine end-to-end for an employee + period. */
export async function generatePayslipDraft(
  employeeId: string,
  period: string,
  opts?: { workingDays?: number; paidDays?: number }
): Promise<{
  draft: PayslipDraft
  costCenterId: string | null
  countryCode: string
  currency: string
  organizationId: string
}> {
  const { inputs, countryCode, currency, organizationId, costCenterId } = await buildCalcInputs(employeeId, period, opts)
  const draft = calculatePayslip(inputs)
  return { draft, countryCode, currency, organizationId, costCenterId }
}
