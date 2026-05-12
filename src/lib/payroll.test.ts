import { describe, it, expect } from "vitest"
import {
  calculatePayslip,
  computeBracketTax,
  computeRule,
  evaluateFormula,
  proRate,
  toMinor,
  fromMinor,
  type PayrollRule,
} from "./payroll"

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

describe("payroll money helpers", () => {
  it("toMinor → minor units, fromMinor → major", () => {
    expect(toMinor(12.34)).toBe(1234)
    expect(toMinor("12.34")).toBe(1234)
    expect(fromMinor(1234)).toBe(12.34)
  })
  it("toMinor handles non-finite inputs", () => {
    expect(toMinor(NaN)).toBe(0)
    expect(toMinor("not a number")).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Bracket tax
// ---------------------------------------------------------------------------

describe("computeBracketTax", () => {
  // Indonesia-ish PPh21 simplified:
  //   0 – 60M IDR @ 5%
  //   60M – 250M @ 15%
  //   250M – 500M @ 25%
  //   500M+    @ 30%
  const brackets = [
    { minAmount: 0,            maxAmount: 60_000_000,  rate: 0.05 },
    { minAmount: 60_000_000,   maxAmount: 250_000_000, rate: 0.15 },
    { minAmount: 250_000_000,  maxAmount: 500_000_000, rate: 0.25 },
    { minAmount: 500_000_000,  maxAmount: null,        rate: 0.30 },
  ]

  it("zero income → zero tax", () => {
    expect(computeBracketTax(0, brackets)).toBe(0)
    expect(computeBracketTax(-100, brackets)).toBe(0)
  })

  it("first bracket only", () => {
    // 30M of taxable @ 5% = 1.5M
    expect(computeBracketTax(30_000_000, brackets)).toBe(1_500_000)
  })

  it("spans two brackets", () => {
    // 100M = 60M @ 5% + 40M @ 15% = 3M + 6M = 9M
    expect(computeBracketTax(100_000_000, brackets)).toBe(9_000_000)
  })

  it("spans every bracket including top", () => {
    // 700M = 60M*0.05 + 190M*0.15 + 250M*0.25 + 200M*0.30
    //      = 3M + 28.5M + 62.5M + 60M = 154M
    expect(computeBracketTax(700_000_000, brackets)).toBe(154_000_000)
  })

  it("empty brackets → zero tax", () => {
    expect(computeBracketTax(1_000_000, [])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Single-rule application
// ---------------------------------------------------------------------------

describe("computeRule", () => {
  const ctx = { base: 1_000_000, gross: 1_500_000, taxable: 1_200_000, computed: {} }

  it("FIXED returns rule.fixedAmount", () => {
    const rule: PayrollRule = {
      componentCode: "HOUSING", componentName: "Housing",
      componentType: "EARNING", isTaxable: true, enabled: true,
      calculationType: "FIXED", fixedAmount: 250_000, sortOrder: 10,
    }
    expect(computeRule(rule, ctx)).toBe(250_000)
  })

  it("PERCENT_BASE multiplies base × percentage", () => {
    const rule: PayrollRule = {
      componentCode: "BONUS", componentName: "Bonus",
      componentType: "EARNING", isTaxable: true, enabled: true,
      calculationType: "PERCENT_BASE", percentage: 0.10, sortOrder: 20,
    }
    // 1_000_000 * 0.10 = 100_000
    expect(computeRule(rule, ctx)).toBe(100_000)
  })

  it("PERCENT_GROSS uses running gross", () => {
    const rule: PayrollRule = {
      componentCode: "PENSION", componentName: "Pension",
      componentType: "STATUTORY_DEDUCTION", isTaxable: false, enabled: true,
      calculationType: "PERCENT_GROSS", percentage: 0.05, sortOrder: 100,
    }
    expect(computeRule(rule, ctx)).toBe(75_000) // 1.5M * 5%
  })

  it("disabled rule returns 0", () => {
    const rule: PayrollRule = {
      componentCode: "X", componentName: "X",
      componentType: "EARNING", isTaxable: true, enabled: false,
      calculationType: "FIXED", fixedAmount: 999_999, sortOrder: 0,
    }
    expect(computeRule(rule, ctx)).toBe(0)
  })

  it("respects min / max caps", () => {
    // 50% of 1.5M gross = 750_000, but max is 500_000
    const capped: PayrollRule = {
      componentCode: "CAP", componentName: "Capped",
      componentType: "STATUTORY_DEDUCTION", isTaxable: false, enabled: true,
      calculationType: "PERCENT_GROSS", percentage: 0.50,
      maxAmount: 500_000, sortOrder: 100,
    }
    expect(computeRule(capped, ctx)).toBe(500_000)

    // 1% of base = 10_000, but min is 50_000
    const floored: PayrollRule = {
      componentCode: "FLOOR", componentName: "Min",
      componentType: "VOLUNTARY_DEDUCTION", isTaxable: false, enabled: true,
      calculationType: "PERCENT_BASE", percentage: 0.01,
      minAmount: 50_000, sortOrder: 200,
    }
    expect(computeRule(floored, ctx)).toBe(50_000)
  })
})

// ---------------------------------------------------------------------------
// Formula evaluator
// ---------------------------------------------------------------------------

describe("evaluateFormula", () => {
  const ctx = { base: 1_000_000, gross: 1_500_000, taxable: 1_200_000, computed: { BONUS: 100_000 } }
  // Reminder: env values are in MAJOR units (10000.00 not 1000000 minor).

  it("BASE × 0.5 → half of base", () => {
    expect(evaluateFormula("BASE * 0.5", ctx)).toBe(500_000)
  })
  it("respects parentheses", () => {
    // (10000 + 5000) * 0.1 = 1500.00 → 150_000 minor
    expect(evaluateFormula("(BASE + 5000) * 0.1", { ...ctx, base: 1_000_000 })).toBe(150_000)
  })
  it("references previously-computed components", () => {
    // BONUS (env value 1000.00) * 2 → 200_000
    expect(evaluateFormula("BONUS * 2", ctx)).toBe(200_000)
  })
  it("rejects unsafe characters", () => {
    expect(evaluateFormula("alert('x')", ctx)).toBe(0)
    expect(evaluateFormula("BASE + window", ctx)).toBe(0)
  })
  it("returns 0 for garbage", () => {
    expect(evaluateFormula("", ctx)).toBe(0)
    expect(evaluateFormula("not a formula", ctx)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Pro-rata
// ---------------------------------------------------------------------------

describe("proRate", () => {
  it("returns amount when fully paid", () => {
    expect(proRate(1_000_000, 22, 22)).toBe(1_000_000)
    expect(proRate(1_000_000, 30, 22)).toBe(1_000_000) // can't exceed full
  })
  it("scales by paid / working", () => {
    // 11 days of 22 working days → half
    expect(proRate(1_000_000, 11, 22)).toBe(500_000)
  })
  it("zero paid days → zero", () => {
    expect(proRate(1_000_000, 0, 22)).toBe(0)
    expect(proRate(1_000_000, -1, 22)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// End-to-end calculatePayslip
// ---------------------------------------------------------------------------

describe("calculatePayslip", () => {
  // Minimal Indonesia-ish setup:
  //   Earnings: Basic Salary, Housing Allowance, Transport Allowance
  //   Statutory: PPh21 (5% flat for simplicity), BPJS Health (1%)
  //   Voluntary: Loan repayment (fixed)
  const rules: PayrollRule[] = [
    { componentCode: "BASIC_SALARY", componentName: "Basic Salary", componentType: "EARNING", isTaxable: true, enabled: true, calculationType: "FIXED", fixedAmount: 0, sortOrder: 0 },
    { componentCode: "HOUSING_ALLOWANCE", componentName: "Housing", componentType: "EARNING", isTaxable: true, enabled: true, calculationType: "FIXED", fixedAmount: 200_000, sortOrder: 10 },
    { componentCode: "TRANSPORT_ALLOWANCE", componentName: "Transport", componentType: "EARNING", isTaxable: false, enabled: true, calculationType: "FIXED", fixedAmount: 100_000, sortOrder: 20 },
    { componentCode: "INCOME_TAX", componentName: "Income Tax", componentType: "STATUTORY_DEDUCTION", isTaxable: false, enabled: true, calculationType: "PERCENT_BASE", percentage: 0.05, sortOrder: 100 },
    { componentCode: "BPJS_HEALTH", componentName: "BPJS Health", componentType: "STATUTORY_DEDUCTION", isTaxable: false, enabled: true, calculationType: "PERCENT_GROSS", percentage: 0.01, sortOrder: 110 },
    { componentCode: "LOAN_REPAYMENT", componentName: "Loan", componentType: "VOLUNTARY_DEDUCTION", isTaxable: false, enabled: true, calculationType: "FIXED", fixedAmount: 50_000, sortOrder: 200 },
  ]

  it("happy path — full month, no adjustments", () => {
    const result = calculatePayslip({
      baseSalary: 1_000_000, // 10,000.00
      rules,
      adjustments: [],
    })
    // Gross: basic 1M + housing 200k + transport 100k = 1.3M
    expect(result.grossPay).toBe(1_300_000)
    // Taxable: basic + housing (transport flagged non-taxable) = 1.2M
    expect(result.taxableIncome).toBe(1_200_000)
    // Deductions: tax 5% of base = 50k, BPJS 1% of gross (1.3M) = 13k, loan 50k = 113k
    expect(result.totalDeductions).toBe(50_000 + 13_000 + 50_000)
    // Net: 1.3M - 113k = 1,187,000
    expect(result.netPay).toBe(1_300_000 - 113_000)
    // 6 line items.
    expect(result.lines.length).toBe(6)
  })

  it("pro-rata applies to base only", () => {
    // 11 days of 22 → half base = 500_000. Allowances unchanged.
    const result = calculatePayslip({
      baseSalary: 1_000_000,
      workingDays: 22,
      paidDays: 11,
      rules,
      adjustments: [],
    })
    // Gross: 500k base + 200k + 100k = 800k
    expect(result.grossPay).toBe(800_000)
    // Tax (5% of pro-rated base 500k) = 25k
    const tax = result.lines.find((l) => l.componentCode === "INCOME_TAX")!
    expect(tax.amount).toBe(25_000)
  })

  it("adjustment matching an existing earning increases that line", () => {
    const result = calculatePayslip({
      baseSalary: 1_000_000,
      rules,
      adjustments: [{ componentCode: "HOUSING_ALLOWANCE", amount: 100_000 }],
    })
    const housing = result.lines.find((l) => l.componentCode === "HOUSING_ALLOWANCE")!
    expect(housing.amount).toBe(200_000 + 100_000)
    // Gross reflects the bump.
    expect(result.grossPay).toBe(1_400_000)
  })

  it("adjustment with unknown code synthesises a new line", () => {
    const result = calculatePayslip({
      baseSalary: 1_000_000,
      rules,
      adjustments: [{ componentCode: "PERFORMANCE_BONUS", amount: 250_000, description: "Q1 bonus" }],
    })
    const bonus = result.lines.find((l) => l.componentCode === "PERFORMANCE_BONUS")!
    expect(bonus).toBeDefined()
    expect(bonus.amount).toBe(250_000)
    expect(bonus.type).toBe("EARNING")
    expect(result.grossPay).toBe(1_300_000 + 250_000)
    expect(result.taxableIncome).toBe(1_200_000 + 250_000)
  })

  it("negative adjustment becomes a voluntary deduction", () => {
    const result = calculatePayslip({
      baseSalary: 1_000_000,
      rules,
      adjustments: [{ componentCode: "UNPAID_LEAVE", amount: -45_000, description: "1 day unpaid" }],
    })
    const ded = result.lines.find((l) => l.componentCode === "UNPAID_LEAVE")!
    expect(ded.type).toBe("VOLUNTARY_DEDUCTION")
    expect(ded.amount).toBe(45_000)
    // Gross unchanged (deduction comes off the net side).
    expect(result.grossPay).toBe(1_300_000)
    expect(result.totalDeductions).toBe(50_000 + 13_000 + 50_000 + 45_000)
  })

  it("override on a component replaces the rule's calculation", () => {
    const result = calculatePayslip({
      baseSalary: 1_000_000,
      rules,
      adjustments: [],
      componentOverrides: { HOUSING_ALLOWANCE: 500_000 },
    })
    const housing = result.lines.find((l) => l.componentCode === "HOUSING_ALLOWANCE")!
    expect(housing.amount).toBe(500_000)
    expect(result.grossPay).toBe(1_000_000 + 500_000 + 100_000)
  })

  it("net pay never goes negative", () => {
    // Salary 100k, deductions add up to >> gross.
    const result = calculatePayslip({
      baseSalary: 100_000,
      rules: [
        { componentCode: "BASIC_SALARY", componentName: "Basic", componentType: "EARNING", isTaxable: true, enabled: true, calculationType: "FIXED", fixedAmount: 0, sortOrder: 0 },
        { componentCode: "BIG_DEDUCTION", componentName: "Big", componentType: "VOLUNTARY_DEDUCTION", isTaxable: false, enabled: true, calculationType: "FIXED", fixedAmount: 9_999_999, sortOrder: 200 },
      ],
      adjustments: [],
    })
    expect(result.netPay).toBe(0)
  })
})
