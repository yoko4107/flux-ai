import { describe, it, expect } from "vitest"
import { countWorkingDays, isWeekend, utcDateOnly } from "./leave-utils"

function holiday(date: string) {
  return { date: new Date(`${date}T00:00:00Z`) } as never
}

describe("leave-utils", () => {
  describe("isWeekend", () => {
    it("Saturday and Sunday count", () => {
      expect(isWeekend(new Date("2026-05-09T00:00:00Z"))).toBe(true) // Sat
      expect(isWeekend(new Date("2026-05-10T00:00:00Z"))).toBe(true) // Sun
    })
    it("Mon–Fri don't count", () => {
      for (let d = 4; d <= 8; d++) {
        // 2026-05-04 (Mon) through 2026-05-08 (Fri)
        expect(isWeekend(new Date(`2026-05-0${d}T00:00:00Z`))).toBe(false)
      }
    })
  })

  describe("countWorkingDays", () => {
    it("counts 5 weekdays Mon–Fri", () => {
      const start = utcDateOnly("2026-05-04") // Mon
      const end = utcDateOnly("2026-05-08")   // Fri
      expect(countWorkingDays(start, end, [])).toBe(5)
    })

    it("skips weekends in a span that straddles them", () => {
      const start = utcDateOnly("2026-05-04") // Mon
      const end = utcDateOnly("2026-05-11")   // next Mon
      // Mon Tue Wed Thu Fri | Sat Sun | Mon = 6 working days
      expect(countWorkingDays(start, end, [])).toBe(6)
    })

    it("skips public holidays", () => {
      const start = utcDateOnly("2026-05-04")
      const end = utcDateOnly("2026-05-08")
      const holidays = [holiday("2026-05-06")] // Wed
      expect(countWorkingDays(start, end, holidays)).toBe(4)
    })

    it("returns 0 when range is entirely in a weekend", () => {
      const start = utcDateOnly("2026-05-09") // Sat
      const end = utcDateOnly("2026-05-10")   // Sun
      expect(countWorkingDays(start, end, [])).toBe(0)
    })

    it("returns 0.5 for a half-day", () => {
      const d = utcDateOnly("2026-05-04")
      expect(countWorkingDays(d, d, [], true)).toBe(0.5)
    })

    it("returns 0 when end < start", () => {
      const start = utcDateOnly("2026-05-08")
      const end = utcDateOnly("2026-05-04")
      expect(countWorkingDays(start, end, [])).toBe(0)
    })

    it("counts a single weekday correctly", () => {
      const d = utcDateOnly("2026-05-04")
      expect(countWorkingDays(d, d, [])).toBe(1)
    })
  })

  describe("utcDateOnly", () => {
    it("strips time-of-day to UTC midnight", () => {
      const d = utcDateOnly("2026-05-04T15:30:00Z")
      expect(d.getUTCHours()).toBe(0)
      expect(d.getUTCDate()).toBe(4)
    })
    it("accepts a Date input", () => {
      const d = utcDateOnly(new Date("2026-05-04T23:59:59Z"))
      expect(d.getUTCHours()).toBe(0)
      expect(d.getUTCDate()).toBe(4)
    })
  })
})
