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
    // Default: live feeds always fail. Tests rely on the hardcoded fallback
    // table that was added to fix the VND-was-treated-as-IDR bug.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
  })

  it("returns amount unchanged for same-currency conversion", async () => {
    const { convert } = await loadModule()
    const r = await convert(1000, "IDR", "IDR")
    expect(r.amountBase).toBe(1000)
    expect(r.exchangeRate).toBe(1)
  })

  it("VND → IDR uses fallback rate (~0.65), not 1:1", async () => {
    const { convert } = await loadModule()
    const r = await convert(442_743, "VND", "IDR")
    // 442743 × 0.65 ≈ 287,783
    expect(r.amountBase).toBe(Math.round(442_743 * 0.65))
    expect(r.exchangeRate).toBeCloseTo(0.65, 2)
  })

  it("USD → IDR uses fallback ~16,200", async () => {
    const { convert } = await loadModule()
    const r = await convert(50, "USD", "IDR")
    expect(r.amountBase).toBe(50 * 16200)
    expect(r.exchangeRate).toBeCloseTo(16200, 0)
  })

  it("IDR → USD uses inverse fallback rate", async () => {
    const { convert } = await loadModule()
    const r = await convert(810_000, "IDR", "USD")
    // 810000 / 16200 = 50.00
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
    // r.amountBase will be a small number; just verify ≤ 2 decimals
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

  it("uses live rates when fetch returns valid data", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("exchangerate.host")) {
        return {
          ok: true,
          json: async () => ({ rates: { USD: 0.0001, VND: 0.0015 } }),
        }
      }
      throw new Error("offline")
    }))
    const { convert } = await loadModule()
    const r = await convert(100, "USD", "IDR")
    // 1 USD = 1 / 0.0001 = 10,000 IDR
    expect(r.amountBase).toBe(100 * 10_000)
  })

  it("layers live rates on top of fallbacks (VND missing from feed still works)", async () => {
    // exchangerate.host returns USD but NOT VND.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("exchangerate.host")) {
        return {
          ok: true,
          json: async () => ({ rates: { USD: 0.0001 } }),
        }
      }
      throw new Error("offline")
    }))
    const { convert } = await loadModule()
    const r = await convert(442_743, "VND", "IDR")
    // VND falls back to ~0.65 even though USD comes from the live feed.
    expect(r.amountBase).toBeGreaterThan(0)
    expect(r.exchangeRate).toBeCloseTo(0.65, 2)
  })
})
