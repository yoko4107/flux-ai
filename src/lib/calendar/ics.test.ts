import { describe, it, expect } from "vitest"
import { buildIcs, halfDayWindow } from "./ics"

describe("calendar/ics", () => {
  it("emits a valid VCALENDAR / VEVENT structure", () => {
    const out = buildIcs({
      uid: "test-1@flux.ai",
      summary: "Annual Leave",
      description: "5 days",
      start: new Date(Date.UTC(2026, 4, 4)),
      end: new Date(Date.UTC(2026, 4, 9)),
      allDay: true,
    })
    expect(out).toContain("BEGIN:VCALENDAR")
    expect(out).toContain("END:VCALENDAR")
    expect(out).toContain("BEGIN:VEVENT")
    expect(out).toContain("END:VEVENT")
    expect(out).toContain("UID:test-1@flux.ai")
    expect(out).toContain("SUMMARY:Annual Leave")
    expect(out).toContain("DTSTART;VALUE=DATE:20260504")
    expect(out).toContain("DTEND;VALUE=DATE:20260509")
    // CRLF line endings (RFC 5545)
    expect(out.includes("\r\n")).toBe(true)
  })

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const out = buildIcs({
      uid: "x@y",
      summary: "Hello, world; with\nbreaks",
      start: new Date(Date.UTC(2026, 0, 1, 10)),
      end: new Date(Date.UTC(2026, 0, 1, 11)),
    })
    expect(out).toContain("SUMMARY:Hello\\, world\\; with\\nbreaks")
  })

  it("uses UTC datetime format for non-all-day events", () => {
    const out = buildIcs({
      uid: "x@y",
      summary: "Half-day AM",
      start: new Date(Date.UTC(2026, 4, 4, 8, 0, 0)),
      end: new Date(Date.UTC(2026, 4, 4, 12, 0, 0)),
    })
    expect(out).toContain("DTSTART:20260504T080000Z")
    expect(out).toContain("DTEND:20260504T120000Z")
  })

  it("halfDayWindow returns AM 08:00–12:00 in UTC", () => {
    const d = new Date(Date.UTC(2026, 4, 4))
    const { start, end } = halfDayWindow(d, "AM")
    expect(start.getUTCHours()).toBe(8)
    expect(end.getUTCHours()).toBe(12)
    expect(start.getUTCDate()).toBe(4)
  })

  it("halfDayWindow returns PM 13:00–17:00 in UTC", () => {
    const d = new Date(Date.UTC(2026, 4, 4))
    const { start, end } = halfDayWindow(d, "PM")
    expect(start.getUTCHours()).toBe(13)
    expect(end.getUTCHours()).toBe(17)
  })

  it("includes ATTENDEE and ORGANIZER when supplied", () => {
    const out = buildIcs({
      uid: "x@y",
      summary: "Meeting",
      start: new Date(Date.UTC(2026, 0, 1)),
      end: new Date(Date.UTC(2026, 0, 2)),
      allDay: true,
      organizerEmail: "boss@company.com",
      organizerName: "Boss",
      attendeeEmail: "me@company.com",
      attendeeName: "Me",
    })
    expect(out).toMatch(/ORGANIZER.*mailto:boss@company\.com/)
    expect(out).toMatch(/ATTENDEE.*mailto:me@company\.com/)
  })
})
