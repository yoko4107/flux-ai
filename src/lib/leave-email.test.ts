import { describe, it, expect } from "vitest"
import { renderTemplate, type LeaveEmailContext } from "./leave-email"

const baseTo = { userId: "u1", email: "user@example.com", name: "Test User" }
const baseDates = {
  startDate: new Date(Date.UTC(2026, 4, 4)), // Mon
  endDate: new Date(Date.UTC(2026, 4, 8)),   // Fri
}

describe("leave-email templates", () => {
  it("REQUEST_SUBMITTED includes employee name + approve/reject URLs", () => {
    const ctx: LeaveEmailContext = {
      type: "REQUEST_SUBMITTED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      ...baseDates,
      totalDays: 5,
      reason: "Family wedding",
      approveToken: "tok-approve",
      rejectToken: "tok-reject",
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Action Required")
    expect(out.subject).toContain("Alice")
    expect(out.html).toContain("Alice")
    expect(out.html).toContain("Annual Leave")
    expect(out.html).toContain("Family wedding")
    expect(out.html).toContain("tok-approve")
    expect(out.html).toContain("tok-reject")
    expect(out.text).toContain("tok-approve")
    expect(out.text).toContain("tok-reject")
    expect(out.icsAttachment).toBeUndefined()
  })

  it("APPROVED attaches an .ics calendar invite", () => {
    const ctx: LeaveEmailContext = {
      type: "APPROVED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      ...baseDates,
      totalDays: 5,
      isHalfDay: false,
      halfDayPeriod: null,
      supervisorNote: "Enjoy!",
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Approved")
    expect(out.icsAttachment).toBeDefined()
    expect(out.icsAttachment!.filename).toBe("leave.ics")
    expect(out.icsAttachment!.content).toContain("BEGIN:VCALENDAR")
    expect(out.icsAttachment!.content).toContain("DTSTART;VALUE=DATE:20260504")
    // RFC-5545 says all-day end is exclusive — bump by 1 day from May 8 → May 9
    expect(out.icsAttachment!.content).toContain("DTEND;VALUE=DATE:20260509")
  })

  it("APPROVED uses half-day window when isHalfDay", () => {
    const single = new Date(Date.UTC(2026, 4, 4))
    const ctx: LeaveEmailContext = {
      type: "APPROVED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      startDate: single,
      endDate: single,
      totalDays: 0.5,
      isHalfDay: true,
      halfDayPeriod: "AM",
      supervisorNote: null,
    }
    const out = renderTemplate(ctx)
    expect(out.icsAttachment!.content).toContain("DTSTART:20260504T080000Z")
    expect(out.icsAttachment!.content).toContain("DTEND:20260504T120000Z")
  })

  it("REJECTED prominently shows the rejection reason", () => {
    const ctx: LeaveEmailContext = {
      type: "REJECTED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      supervisorName: "Bob",
      supervisorEmail: "bob@example.com",
      leaveTypeName: "Annual Leave",
      ...baseDates,
      rejectionReason: "Critical sprint week — please re-submit for next month.",
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Not Approved")
    expect(out.html).toContain("Critical sprint week")
    expect(out.html).toContain("Bob")
    expect(out.text).toContain("Critical sprint week")
  })

  it("SUPERVISOR_PROPOSAL renders side-by-side comparison + agree/disagree URLs", () => {
    const ctx: LeaveEmailContext = {
      type: "SUPERVISOR_PROPOSAL",
      leaveRequestId: "lr1",
      to: baseTo,
      supervisorName: "Bob",
      leaveTypeName: "Annual Leave",
      originalStart: new Date(Date.UTC(2026, 4, 4)),
      originalEnd: new Date(Date.UTC(2026, 4, 8)),
      originalDays: 5,
      proposedStart: new Date(Date.UTC(2026, 4, 11)),
      proposedEnd: new Date(Date.UTC(2026, 4, 15)),
      proposedDays: 5,
      message: "Sprint demo on the 4th — please shift one week.",
      agreeToken: "tok-agree",
      disagreeToken: "tok-disagree",
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Date Change")
    expect(out.html).toContain("tok-agree")
    expect(out.html).toContain("tok-disagree")
    expect(out.html).toContain("Sprint demo on the 4th")
  })

  it("EMPLOYEE_COUNTER renders three-column comparison + approve URL", () => {
    const ctx: LeaveEmailContext = {
      type: "EMPLOYEE_COUNTER",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      originalStart: new Date(Date.UTC(2026, 4, 4)),
      originalEnd: new Date(Date.UTC(2026, 4, 8)),
      supervisorProposedStart: new Date(Date.UTC(2026, 4, 11)),
      supervisorProposedEnd: new Date(Date.UTC(2026, 4, 15)),
      employeeProposedStart: new Date(Date.UTC(2026, 4, 5)),
      employeeProposedEnd: new Date(Date.UTC(2026, 4, 8)),
      employeeProposedDays: 4,
      message: "I can skip the 4th but the rest is locked in.",
      approveToken: "tok-approve",
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Counter-Proposal")
    expect(out.html).toContain("Alice")
    expect(out.html).toContain("tok-approve")
    expect(out.html).toContain("locked in")
  })

  it("PROPOSAL_AGREED ships an .ics with the FINAL dates", () => {
    const ctx: LeaveEmailContext = {
      type: "PROPOSAL_AGREED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      finalStart: new Date(Date.UTC(2026, 4, 11)),
      finalEnd: new Date(Date.UTC(2026, 4, 13)),
      totalDays: 3,
    }
    const out = renderTemplate(ctx)
    expect(out.subject).toContain("Confirmed")
    expect(out.icsAttachment!.content).toContain("DTSTART;VALUE=DATE:20260511")
    expect(out.icsAttachment!.content).toContain("DTEND;VALUE=DATE:20260514")
  })

  it("REMINDER_PENDING re-uses request body but with [Reminder] subject + banner", () => {
    const ctx: LeaveEmailContext = {
      type: "REMINDER_PENDING",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "Alice",
      leaveTypeName: "Annual Leave",
      ...baseDates,
      totalDays: 5,
      reason: "Family wedding",
      approveToken: "tok-approve-fresh",
      rejectToken: "tok-reject-fresh",
      daysWaiting: 3,
    }
    const out = renderTemplate(ctx)
    expect(out.subject.startsWith("[Reminder]")).toBe(true)
    expect(out.subject).toContain("3 day")
    expect(out.html).toContain("Reminder:")
    expect(out.html).toContain("tok-approve-fresh")
    expect(out.text.startsWith("[Reminder]")).toBe(true)
  })

  it("HTML output escapes user-controlled strings", () => {
    const ctx: LeaveEmailContext = {
      type: "REQUEST_SUBMITTED",
      leaveRequestId: "lr1",
      to: baseTo,
      employeeName: "<script>alert(1)</script>",
      leaveTypeName: "Annual",
      ...baseDates,
      totalDays: 1,
      reason: null,
      approveToken: "a",
      rejectToken: "r",
    }
    const out = renderTemplate(ctx)
    expect(out.html).not.toContain("<script>alert(1)</script>")
    expect(out.html).toContain("&lt;script&gt;")
  })
})
