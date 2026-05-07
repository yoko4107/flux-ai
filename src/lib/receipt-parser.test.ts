import { describe, it, expect } from "vitest"
import { extractLineItems, detectMultiTransaction, detectCurrency } from "./receipt-parser"

describe("receipt-parser", () => {
  describe("detectCurrency", () => {
    it("identifies VND from ₫", () => {
      expect(detectCurrency("Total 29.120₫")).toBe("VND")
    })
    it("identifies IDR from Rp", () => {
      expect(detectCurrency("Rp 150.000")).toBe("IDR")
    })
    it("identifies USD from $", () => {
      expect(detectCurrency("$25.50")).toBe("USD")
    })
    it("returns undefined when nothing matches", () => {
      expect(detectCurrency("just some text")).toBeUndefined()
    })
  })

  describe("extractLineItems", () => {
    it("pulls VND amounts with ₫ suffix", () => {
      const text = [
        "Hasaki - 81 Ho Tung Mau",
        "to The Galleria Residence",
        "29.120₫",
        "VPDD BUSINESS to Hasaki",
        "31.200₫",
      ].join("\n")
      const items = extractLineItems(text)
      expect(items.length).toBeGreaterThanOrEqual(2)
      expect(items.map((i) => i.amount)).toContain(29120)
      expect(items.map((i) => i.amount)).toContain(31200)
    })

    it("skips summary lines (Total, Subtotal, etc.)", () => {
      const text = [
        "Item A 10000",
        "Subtotal: 10000",
        "Total: Rp 10000",
      ].join("\n")
      const items = extractLineItems(text, "IDR")
      // Only the "Item A" line should count.
      expect(items.length).toBe(1)
    })

    it("requires a currency hint when neither inline nor default is given", () => {
      const text = "Item A 10000\nItem B 20000"
      expect(extractLineItems(text).length).toBe(0)
    })

    it("uses default currency hint to allow numeric-only lines", () => {
      const text = "Item A 10000\nItem B 20000"
      const items = extractLineItems(text, "IDR")
      // Numbers without thousand-grouping need a currency hint.
      expect(items.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("detectMultiTransaction", () => {
    it("returns null when fewer than 2 items found", () => {
      expect(detectMultiTransaction("Just one Rp 50.000", "IDR")).toBeNull()
    })

    it("returns sum of items when no Total reconciles them", () => {
      const text = "Trip 1 29.120₫\nTrip 2 31.200₫\nTrip 3 28.080₫"
      const result = detectMultiTransaction(text)
      expect(result).not.toBeNull()
      expect(result!.items.length).toBe(3)
      expect(result!.total).toBe(29120 + 31200 + 28080)
    })

    it("returns null when a Total matches the sum within 5%", () => {
      const text = [
        "Item A Rp 5.000",
        "Item B Rp 5.000",
        "Total: Rp 10.000",
      ].join("\n")
      // singleTotal = 10000; sum = 10000 → within 5% → not multi.
      expect(detectMultiTransaction(text, "IDR", 10000)).toBeNull()
    })
  })
})
