/**
 * Payroll calculation engine.
 *
 * Pure functions, no DB. Callers (API routes, scheduled jobs) load the
 * country rules + adjustments and pass them in; the engine applies the
 * math and returns a structured payslip object.
 *
 * Money is represented as integer minor units (cents / sen / kopeks) to
 * avoid floating-point drift. The boundary functions toMinor / fromMinor
 * convert from / to the human-facing decimal representation.
 *
 * Order of operations (matches the spec):
 *   1. Earnings  → gross pay
 *   2. Earnings flagged as taxable → taxable income
 *   3. Statutory deductions (income tax, social insurance) computed against
 *      taxable income or gross depending on the rule
 *   4. Voluntary deductions (loans, gym, insurance premium)
 *   5. Net pay = gross − statutory − voluntary
 *   6. Employer contributions tracked separately (don't reduce net pay).
 *
 * Pro-rata is applied to the BASE only — allowances and benefits keep their
 * full value unless the admin has set them up to scale.
 */

// ---------------------------------------------------------------------------
// Component / rule types
// ---------------------------------------------------------------------------

export type ComponentType =
  | "EARNING"
  | "STATUTORY_DEDUCTION"
  | "VOLUNTARY_DEDUCTION"
  | "EMPLOYER_CONTRIBUTION"

export type CalculationType =
  | "FIXED"           // amount as-is from rule.fixedAmount
  | "PERCENT_BASE"    // percentage of base salary
  | "PERCENT_GROSS"   // percentage of running gross
  | "BRACKET"         // progressive tax brackets
  | "FORMULA"         // simple arithmetic over named variables (limited grammar)

export interface Bracket {
  /** Inclusive lower bound on taxable income (minor units). */
  minAmount: number
  /** Exclusive upper bound; undefined / null = top bracket. */
  maxAmount: number | null
  /** Rate as decimal — 0.10 for 10%. */
  rate: number
}

export interface PayrollRule {
  componentCode: string
  componentName: string
  componentType: ComponentType
  isTaxable: boolean
  enabled: boolean
  calculationType: CalculationType
  /** Amounts in minor units (cents). */
  fixedAmount?: number
  /** Percentage as decimal — 0.05 for 5%. */
  percentage?: number
  formula?: string
  brackets?: Bracket[]
  /** Optional caps applied AFTER the calculation. */
  minAmount?: number
  maxAmount?: number
  sortOrder: number
}

export interface PayrollAdjustment {
  componentCode: string
  /** Positive = adds to earnings, negative = deduction. Minor units. */
  amount: number
  description?: string
}

export interface PayslipLine {
  componentCode: string
  componentName: string
  type: ComponentType
  amount: number      // minor units
  description?: string
  sortOrder: number
}

export interface PayslipDraft {
  workingDays: number
  paidDays: number
  /** All amounts in minor units. */
  grossPay: number
  taxableIncome: number
  totalDeductions: number
  netPay: number
  employerCost: number
  lines: PayslipLine[]
  /** Warnings the engine emitted while computing (e.g. "formula referenced unknown variable X"). */
  warnings: string[]
}

export interface CalcInputs {
  /** Base monthly salary in minor units (cents). */
  baseSalary: number
  /** Country rules ordered ascending by sortOrder. */
  rules: PayrollRule[]
  /** One-off adjustments for this pay period. */
  adjustments: PayrollAdjustment[]
  /** Per-component overrides keyed by componentCode (minor units). */
  componentOverrides?: Record<string, number>
  /** For pro-rata: working days in the period (default 22). */
  workingDays?: number
  /** For pro-rata: days the employee was actually paid. */
  paidDays?: number
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

/** Decimal "12.34" / number 12.34 → 1234 minor units. */
export function toMinor(amount: number | string): number {
  const n = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 1234 minor units → 12.34. */
export function fromMinor(minor: number): number {
  return Math.round(minor) / 100
}

// ---------------------------------------------------------------------------
// Per-component math
// ---------------------------------------------------------------------------

/**
 * Compute the line amount for a single rule given the running state.
 * Returns 0 for disabled rules; never returns negative for earnings.
 *
 * The math runs in minor units to avoid float drift. Percentage rules use
 * `Math.round` at the final step.
 */
function applyCaps(amount: number, rule: PayrollRule): number {
  let v = amount
  if (typeof rule.minAmount === "number") v = Math.max(rule.minAmount, v)
  if (typeof rule.maxAmount === "number") v = Math.min(rule.maxAmount, v)
  return v
}

export function computeRule(
  rule: PayrollRule,
  ctx: { base: number; gross: number; taxable: number; computed: Record<string, number> }
): number {
  if (!rule.enabled) return 0
  switch (rule.calculationType) {
    case "FIXED":
      return applyCaps(rule.fixedAmount ?? 0, rule)
    case "PERCENT_BASE":
      return applyCaps(Math.round(ctx.base * (rule.percentage ?? 0)), rule)
    case "PERCENT_GROSS":
      return applyCaps(Math.round(ctx.gross * (rule.percentage ?? 0)), rule)
    case "BRACKET":
      return applyCaps(computeBracketTax(ctx.taxable, rule.brackets ?? []), rule)
    case "FORMULA":
      return applyCaps(evaluateFormula(rule.formula ?? "", ctx), rule)
    default:
      return 0
  }
}

/**
 * Progressive bracket tax — applies each bracket's rate to the slice of
 * income that falls inside it. Sorted ascending; gaps treated as zero.
 *
 *   bracket 0: [0, 10_000) @ 5%    → 500
 *   bracket 1: [10_000, 50_000) @ 10% → 4000
 *   bracket 2: [50_000, ∞) @ 20% → balance × 20%
 */
export function computeBracketTax(taxable: number, brackets: Bracket[]): number {
  if (taxable <= 0 || brackets.length === 0) return 0
  const sorted = [...brackets].sort((a, b) => a.minAmount - b.minAmount)
  let tax = 0
  for (const br of sorted) {
    const lo = br.minAmount
    const hi = br.maxAmount ?? Number.POSITIVE_INFINITY
    if (taxable <= lo) break
    const slice = Math.min(taxable, hi) - lo
    if (slice > 0) tax += slice * br.rate
  }
  return Math.round(tax)
}

/**
 * Safe recursive-descent arithmetic evaluator.
 *
 * Parses and evaluates expressions containing only:
 *   numeric literals, +, -, *, /, (, ), whitespace.
 *
 * Has zero access to the JavaScript execution context — no eval, no Function().
 * Throws on any unexpected token so callers can catch and return 0.
 *
 * Grammar:
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/') factor)*
 *   factor = '(' expr ')' | ('+' | '-') factor | number
 *   number = [0-9]+ ('.' [0-9]+)?
 */
function safeEvalArithmetic(expr: string): number {
  let pos = 0
  const s = expr.replace(/\s+/g, "")

  function peek(): string { return s[pos] ?? "" }
  function consume(ch: string): void {
    if (s[pos] !== ch) throw new Error(`Expected '${ch}' at ${pos}`)
    pos++
  }

  function parseNumber(): number {
    const start = pos
    while (pos < s.length && /[0-9.]/.test(s[pos])) pos++
    if (pos === start) throw new Error(`Expected number at ${pos}`)
    return Number(s.slice(start, pos))
  }

  function parseFactor(): number {
    if (peek() === "(") {
      consume("(")
      const v = parseExpr()
      consume(")")
      return v
    }
    if (peek() === "-") { pos++; return -parseFactor() }
    if (peek() === "+") { pos++; return parseFactor() }
    return parseNumber()
  }

  function parseTerm(): number {
    let v = parseFactor()
    while (peek() === "*" || peek() === "/") {
      const op = s[pos++]
      const r = parseFactor()
      v = op === "*" ? v * r : v / r
    }
    return v
  }

  function parseExpr(): number {
    let v = parseTerm()
    while (peek() === "+" || peek() === "-") {
      const op = s[pos++]
      const r = parseTerm()
      v = op === "+" ? v + r : v - r
    }
    return v
  }

  const result = parseExpr()
  if (pos !== s.length) throw new Error(`Unexpected character '${peek()}' at ${pos}`)
  return result
}

/**
 * Very small formula evaluator. Supports:
 *   - identifiers: BASE, GROSS, TAXABLE, and any componentCode already
 *     computed (case-sensitive).
 *   - numeric literals: 123, 4.5 (interpreted as MAJOR units → ×100 to get minor).
 *   - operators: + - * / ( )
 *
 * Anything else (function calls, comparisons, string concatenation, etc.)
 * is rejected and the formula returns 0. This is intentionally restrictive —
 * the admin Formula Builder UI should expose only valid expressions.
 */
export function evaluateFormula(
  formula: string,
  ctx: { base: number; gross: number; taxable: number; computed: Record<string, number> }
): number {
  if (!formula) return 0
  // Whitelist: identifiers, digits, dots, operators, parens, whitespace.
  if (!/^[A-Za-z0-9_+\-*/().\s]+$/.test(formula)) return 0
  // Replace identifiers with their numeric values (in MAJOR units so the
  // formula reads naturally — admin types `BASE * 0.05`, not `BASE * 5 / 100`).
  const env: Record<string, number> = {
    BASE: ctx.base / 100,
    GROSS: ctx.gross / 100,
    TAXABLE: ctx.taxable / 100,
    ...Object.fromEntries(Object.entries(ctx.computed).map(([k, v]) => [k, v / 100])),
  }
  let replaced = formula
  for (const [name, value] of Object.entries(env)) {
    replaced = replaced.replace(new RegExp(`\\b${name}\\b`, "g"), String(value))
  }
  // After substitution only digits / operators / parens / whitespace must remain.
  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) return 0
  try {
    // Use a safe recursive-descent parser — no JS execution context access.
    const result = safeEvalArithmetic(replaced)
    if (!Number.isFinite(result)) return 0
    return Math.round(result * 100) // back to minor units
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Pro-rata
// ---------------------------------------------------------------------------

/**
 * Pro-rate an amount based on paid days vs working days in the period.
 * Pass-through when the period is fully paid or working days <= 0.
 */
export function proRate(amount: number, paidDays: number, workingDays: number): number {
  if (workingDays <= 0 || paidDays >= workingDays) return amount
  if (paidDays <= 0) return 0
  return Math.round((amount * paidDays) / workingDays)
}

// ---------------------------------------------------------------------------
// Engine entry point
// ---------------------------------------------------------------------------

export function calculatePayslip(input: CalcInputs): PayslipDraft {
  const warnings: string[] = []
  const workingDays = input.workingDays ?? 22
  const paidDays = input.paidDays ?? workingDays
  const overrides = input.componentOverrides ?? {}

  const base = proRate(input.baseSalary, paidDays, workingDays)
  const sortedRules = [...input.rules].sort((a, b) => a.sortOrder - b.sortOrder)
  const adjustmentByCode = new Map<string, number>()
  for (const a of input.adjustments) {
    adjustmentByCode.set(a.componentCode, (adjustmentByCode.get(a.componentCode) ?? 0) + a.amount)
  }

  const lines: PayslipLine[] = []
  const computed: Record<string, number> = {}
  let gross = 0
  let taxable = 0
  let statutoryDeductions = 0
  let voluntaryDeductions = 0
  let employerCost = 0

  // Phase 1 — earnings (so gross is known before deductions run).
  for (const rule of sortedRules) {
    if (rule.componentType !== "EARNING") continue
    const ctx = { base, gross, taxable, computed }
    let amount = rule.componentCode === "BASIC_SALARY"
      ? base
      : computeRule(rule, ctx)
    // Override wins over rule.
    if (rule.componentCode in overrides) {
      amount = overrides[rule.componentCode]
    }
    // One-off adjustments add on top.
    const adj = adjustmentByCode.get(rule.componentCode) ?? 0
    if (adj !== 0) {
      amount += adj
      adjustmentByCode.delete(rule.componentCode)
    }
    if (amount === 0) continue
    lines.push({
      componentCode: rule.componentCode,
      componentName: rule.componentName,
      type: "EARNING",
      amount,
      sortOrder: rule.sortOrder,
    })
    computed[rule.componentCode] = amount
    gross += amount
    if (rule.isTaxable) taxable += amount
  }

  // Any adjustments that don't match an existing earning rule still need a
  // home — synthesise an "Adjustment" line so the audit trail is honest.
  for (const [code, amount] of adjustmentByCode.entries()) {
    if (amount === 0) continue
    lines.push({
      componentCode: code,
      componentName: code.replace(/_/g, " "),
      type: amount > 0 ? "EARNING" : "VOLUNTARY_DEDUCTION",
      amount: Math.abs(amount),
      description: "Adjustment",
      sortOrder: 95,
    })
    computed[code] = amount
    if (amount > 0) {
      gross += amount
      taxable += amount
    } else {
      voluntaryDeductions += -amount
    }
  }

  // Phase 2 — statutory deductions (income tax, social insurance).
  for (const rule of sortedRules) {
    if (rule.componentType !== "STATUTORY_DEDUCTION") continue
    const ctx = { base, gross, taxable, computed }
    let amount = computeRule(rule, ctx)
    if (rule.componentCode in overrides) amount = overrides[rule.componentCode]
    if (amount === 0) continue
    lines.push({
      componentCode: rule.componentCode,
      componentName: rule.componentName,
      type: "STATUTORY_DEDUCTION",
      amount,
      sortOrder: rule.sortOrder,
    })
    computed[rule.componentCode] = -amount
    statutoryDeductions += amount
  }

  // Phase 3 — voluntary deductions (loans, gym, insurance premium).
  for (const rule of sortedRules) {
    if (rule.componentType !== "VOLUNTARY_DEDUCTION") continue
    const ctx = { base, gross, taxable, computed }
    let amount = computeRule(rule, ctx)
    if (rule.componentCode in overrides) amount = overrides[rule.componentCode]
    if (amount === 0) continue
    lines.push({
      componentCode: rule.componentCode,
      componentName: rule.componentName,
      type: "VOLUNTARY_DEDUCTION",
      amount,
      sortOrder: rule.sortOrder,
    })
    computed[rule.componentCode] = -amount
    voluntaryDeductions += amount
  }

  // Phase 4 — employer contributions (informational, not deducted from net).
  for (const rule of sortedRules) {
    if (rule.componentType !== "EMPLOYER_CONTRIBUTION") continue
    const ctx = { base, gross, taxable, computed }
    const amount = computeRule(rule, ctx)
    if (amount === 0) continue
    lines.push({
      componentCode: rule.componentCode,
      componentName: rule.componentName,
      type: "EMPLOYER_CONTRIBUTION",
      amount,
      sortOrder: rule.sortOrder,
    })
    computed[rule.componentCode] = amount
    employerCost += amount
  }

  const totalDeductions = statutoryDeductions + voluntaryDeductions
  const netPay = Math.max(0, gross - totalDeductions)

  return {
    workingDays,
    paidDays,
    grossPay: gross,
    taxableIncome: taxable,
    totalDeductions,
    netPay,
    employerCost: employerCost + gross, // employer paid gross + their contributions
    lines: lines.sort((a, b) => a.sortOrder - b.sortOrder),
    warnings,
  }
}
