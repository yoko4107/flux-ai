/**
 * Seed the global PayrollComponent library with the standard worldwide
 * categories from the spec. Idempotent — upserts by code, safe to re-run.
 *
 * Run with:
 *   npx tsx scripts/seed-payroll-components.ts
 */

import { PrismaClient } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

interface ComponentSpec {
  code: string
  name: string
  type: "EARNING" | "STATUTORY_DEDUCTION" | "VOLUNTARY_DEDUCTION" | "EMPLOYER_CONTRIBUTION"
  isTaxable: boolean
  description: string
}

const STANDARD_COMPONENTS: ComponentSpec[] = [
  // ---- Earnings ----------------------------------------------------------
  { code: "BASIC_SALARY",        name: "Basic Salary",        type: "EARNING", isTaxable: true,  description: "Core contracted monthly amount." },
  { code: "HOUSING_ALLOWANCE",   name: "Housing Allowance",   type: "EARNING", isTaxable: true,  description: "Monthly housing / accommodation allowance." },
  { code: "TRANSPORT_ALLOWANCE", name: "Transport Allowance", type: "EARNING", isTaxable: true,  description: "Commuting / transport allowance." },
  { code: "MEAL_ALLOWANCE",      name: "Meal Allowance",      type: "EARNING", isTaxable: false, description: "Per-month meal voucher or stipend. Typically non-taxable up to a threshold." },
  { code: "REMOTE_WORK_STIPEND", name: "Remote Work Stipend", type: "EARNING", isTaxable: false, description: "Home-office equipment / utilities stipend (de minimis)." },
  { code: "PERFORMANCE_BONUS",   name: "Performance Bonus",   type: "EARNING", isTaxable: true,  description: "Performance-based bonus added to the period." },
  { code: "COMMISSION",          name: "Commission",          type: "EARNING", isTaxable: true,  description: "Sales / output-based commission." },
  { code: "OVERTIME_PAY",        name: "Overtime Pay",        type: "EARNING", isTaxable: true,  description: "Overtime hours × applicable multiplier." },
  { code: "THIRTEENTH_MONTH",    name: "13th Month Pay",      type: "EARNING", isTaxable: true,  description: "Annual statutory 13th-month bonus where applicable." },

  // ---- Statutory employee deductions -------------------------------------
  { code: "INCOME_TAX",          name: "Income Tax",          type: "STATUTORY_DEDUCTION", isTaxable: false, description: "PAYE / PIT / PPh21 — withholding tax." },
  { code: "SOCIAL_INSURANCE",    name: "Social Insurance",    type: "STATUTORY_DEDUCTION", isTaxable: false, description: "Pension / national insurance contribution." },
  { code: "HEALTH_INSURANCE",    name: "Health Insurance",    type: "STATUTORY_DEDUCTION", isTaxable: false, description: "Mandatory health insurance (e.g. BPJS Kesehatan)." },
  { code: "UNEMPLOYMENT_INS",    name: "Unemployment Insurance", type: "STATUTORY_DEDUCTION", isTaxable: false, description: "Unemployment insurance contribution where applicable." },
  { code: "PENSION_EE",          name: "Pension (employee)",  type: "STATUTORY_DEDUCTION", isTaxable: false, description: "Employee-side retirement contribution." },

  // ---- Voluntary / post-tax deductions -----------------------------------
  { code: "PRIVATE_HEALTH",      name: "Private Health Insurance Premium", type: "VOLUNTARY_DEDUCTION", isTaxable: false, description: "Employee-elected private health insurance premium." },
  { code: "LOAN_REPAYMENT",      name: "Loan Repayment",      type: "VOLUNTARY_DEDUCTION", isTaxable: false, description: "Repayment of a company-provided loan." },
  { code: "GYM_WELLNESS",        name: "Gym / Wellness",      type: "VOLUNTARY_DEDUCTION", isTaxable: false, description: "Employee-elected wellness benefit deduction." },
  { code: "UNPAID_LEAVE",        name: "Unpaid Leave",        type: "VOLUNTARY_DEDUCTION", isTaxable: false, description: "Deduction for unpaid leave days (Base / Work Days × Missed)." },

  // ---- Employer contributions (informational, not deducted from net) -----
  { code: "EMPLOYER_PENSION",    name: "Pension (employer)",  type: "EMPLOYER_CONTRIBUTION", isTaxable: false, description: "Employer-side pension contribution." },
  { code: "EMPLOYER_HEALTH",     name: "Health (employer)",   type: "EMPLOYER_CONTRIBUTION", isTaxable: false, description: "Employer-side health insurance contribution." },
  { code: "PAYROLL_TAX",         name: "Payroll Tax (employer)", type: "EMPLOYER_CONTRIBUTION", isTaxable: false, description: "Employer-side payroll tax (not deducted from employee)." },
]

async function main() {
  let created = 0
  let updated = 0
  for (const c of STANDARD_COMPONENTS) {
    const existing = await prisma.payrollComponent.findUnique({ where: { code: c.code } })
    await prisma.payrollComponent.upsert({
      where: { code: c.code },
      update: { name: c.name, type: c.type, isTaxable: c.isTaxable, description: c.description },
      create: c,
    })
    if (existing) updated++; else created++
  }
  console.log(`Payroll components seeded — ${created} created, ${updated} updated, ${STANDARD_COMPONENTS.length} total.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
