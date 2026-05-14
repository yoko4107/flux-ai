import { describe, it, expect } from "vitest"
import { mergeCategories, customCategorySchema } from "../custom-categories"

describe("mergeCategories", () => {
  it("returns exactly 12 defaults when customCategories is empty", () => {
    const result = mergeCategories([])
    expect(result).toHaveLength(12)
  })

  it("returns exactly 12 defaults when customCategories is null", () => {
    const result = mergeCategories(null)
    expect(result).toHaveLength(12)
  })

  it("appends enabled custom category code to defaults (returns 13 entries)", () => {
    const result = mergeCategories([{ name: "Conf", code: "CONF", enabled: true }])
    expect(result).toHaveLength(13)
    expect(result[result.length - 1]).toBe("CONF")
  })

  it("excludes disabled custom categories from the merged list", () => {
    const result = mergeCategories([{ name: "Conf", code: "CONF", enabled: false }])
    expect(result).toHaveLength(12)
    expect(result.includes("CONF")).toBe(false)
  })

  it("does NOT deduplicate — custom code matching an enum code appears after the enum value", () => {
    const result = mergeCategories([
      { name: "Conf", code: "CONF", enabled: true },
      { name: "X", code: "TRAVEL", enabled: true },
    ])
    expect(result).toHaveLength(14)
    // Default TRAVEL is still there
    const firstTravel = result.indexOf("TRAVEL")
    const lastTravel = result.lastIndexOf("TRAVEL")
    expect(firstTravel).not.toBe(lastTravel)
  })
})

describe("customCategorySchema", () => {
  it("parses a valid custom category", () => {
    expect(() =>
      customCategorySchema.parse({ name: "Conf", code: "CONF_FEES", enabled: true })
    ).not.toThrow()
  })

  it("throws on code with lowercase letters and spaces", () => {
    expect(() =>
      customCategorySchema.parse({ name: "Conf", code: "conf fees", enabled: true })
    ).toThrow()
  })

  it("throws on empty name", () => {
    expect(() =>
      customCategorySchema.parse({ name: "", code: "CONF", enabled: true })
    ).toThrow()
  })
})
