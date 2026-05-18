import { describe, it, expect, beforeEach, vi } from "vitest"

// Force the fx-rates module to re-evaluate before each test so the in-memory
// cache doesn't leak across tests, and so the mocked fetch is in place
// before the module's first import.
async function loadModule() {
  vi.resetModules()
  return await import("./fx-rates")
}

describe("fx-rates.convert", () => {
  beforeEach(() => {
    // Default: all live feeds fail. Tests rely on the hardcoded fallback table.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
  })

  it("returns amount unchanged for same-currency conversion", async () => {
    const { convert } = await loadModule()
    const r = await convert(1000, "IDR", "IDR")
    expect(r.amountBase).toBe(1000)
    expect(r.exchangeRate).toBe(1)
  })

  it("VND → IDR uses fallback rate (~0.67), not 1:1", async () => {
    const { convert } = await loadModule()
    const r = await convert(442_743, "VND", "IDR")
    // 442743 × 0.67 ≈ 287,637
    expect(r.amountBase).toBe(Math.round(442_743 * 0.67))
    expect(r.exchangeRate).toBeCloseTo(0.67, 2)
  })

  it("USD → IDR uses fallback ~17,556", async () => {
    const { convert } = await loadModule()
    const r = await convert(50, "USD", "IDR")
    expect(r.amountBase).toBe(50 * 17556)
    expect(r.exchangeRate).toBeCloseTo(17556, 0)
  })

  it("IDR → USD uses inverse fallback rate", async () => {
    const { convert } = await loadModule()
    const r = await convert(877_800, "IDR", "USD")
    // 877800 / 17556 = 50.00
    expect(r.amountBase).toBeCloseTo(50, 1)
  })

  it("rounds to 0 decimals for zero-decimal target currencies", async () => {
    const { convert } = await loadModule()
    const r = await convert(100, "USD", "JPY")
    expect(Number.isInteger(r.amountBase)).toBe(true)
  })

  it("rounds to 2 decimals for normal target currencies", async () => {
    const { convert } = await loadModule()
    const r = await convert(100, "JPY", "USD")
    const decimals = (String(r.amountBase).split(".")[1] ?? "").length
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it("falls back to 1:1 with a warn when currency is genuinely unknown", async () => {
    const { convert } = await loadModule()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const r = await convert(100, "XYZ", "IDR")
    expect(r.amountBase).toBe(100)
    expect(r.exchangeRate).toBe(1)
    warn.mockRestore()
  })

  it("uses live rates from open.er-api.com when available", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("open.er-api.com")) {
        return {
          ok: true,
          json: async () => ({
            result: "success",
            base_code: "USD",
            rates: { USD: 1, IDR: 17500, VND: 26000, SGD: 1.28 },
          }),
        }
      }
      throw new Error("offline")
    }))
    const { convert } = await loadModule()
    const r = await convert(100, "USD", "IDR")
    expect(r.amountBase).toBe(100 * 17500)
  })

  it("uses fawazahmed0 CDN when open.er-api fails (covers VND)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("open.er-api.com")) throw new Error("offline")
      if (url.includes("fawazahmed0")) {
        return {
          ok: true,
          json: async () => ({
            date: "2026-05-18",
            usd: { idr: 17500, vnd: 26000, sgd: 1.28 },
          }),
        }
      }
      throw new Error("offline")
    }))
    const { convert } = await loadModule()
    const r = await convert(26000, "VND", "IDR")
    // 1 VND = 17500/26000 IDR ≈ 0.6731
    expect(r.amountBase).toBeCloseTo(17500, -2)
  })

  it("falls through to frankfurter when first two sources fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("open.er-api.com")) throw new Error("offline")
      if (url.includes("fawazahmed0")) throw new Error("offline")
      if (url.includes("frankfurter.app")) {
        return {
          ok: true,
          json: async () => ({
            base: "USD",
            rates: { IDR: 17500, SGD: 1.28, EUR: 0.91 },
          }),
        }
      }
      throw new Error("offline")
    }))
    const { convert } = await loadModule()
    const r = await convert(100, "USD", "IDR")
    expect(r.amountBase).toBe(100 * 17500)
  })

  it("VND falls to hardcoded fallback when frankfurter lacks it (all live fail)", async () => {
    // All sources fail
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    const { convert } = await loadModule()
    const r = await convert(442_743, "VND", "IDR")
    expect(r.amountBase).toBeGreaterThan(0)
    expect(r.exchangeRate).toBeCloseTo(0.67, 2)
  })
})
