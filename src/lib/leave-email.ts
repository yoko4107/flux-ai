/**
 * Leave & Calendar email sender.
 *
 * Single entry point: `sendLeaveEmail(...)`. It dispatches by template,
 * wraps Resend, attaches .ics where appropriate, and records every send
 * in `LeaveEmailEvent` so the admin audit log and reminder/expiry jobs
 * can see what's been delivered.
 *
 * Templates are inline tagged-template HTML strings. Plain-text fallback
 * is auto-derived from the HTML to keep the templates simple.
 */

import { prisma } from "@/lib/prisma"
import { generateToken, buildActionUrl, type TokenAction } from "@/lib/email-tokens"
import { buildIcs, halfDayWindow, type IcsEvent } from "@/lib/calendar/ics"
import type { LeaveEmailType } from "@/generated/prisma"

const FROM = process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>"
const APP = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"

interface BaseLeaveCtx {
  leaveRequestId: string
  to: { userId?: string; email: string; name?: string }
  // Replies bounce back to the originating party rather than to noreply.
  replyTo?: string
  organizationName?: string
}

interface RequestSubmittedCtx extends BaseLeaveCtx {
  type: "REQUEST_SUBMITTED"
  employeeName: string
  leaveTypeName: string
  startDate: Date
  endDate: Date
  totalDays: number
  reason?: string | null
  approveToken: string
  rejectToken: string
}

interface ReminderPendingCtx extends BaseLeaveCtx {
  type: "REMINDER_PENDING"
  employeeName: string
  leaveTypeName: string
  startDate: Date
  endDate: Date
  totalDays: number
  reason?: string | null
  approveToken: string
  rejectToken: string
  daysWaiting: number
}

interface ApprovedCtx extends BaseLeaveCtx {
  type: "APPROVED"
  employeeName: string
  leaveTypeName: string
  startDate: Date
  endDate: Date
  totalDays: number
  isHalfDay: boolean
  halfDayPeriod?: "AM" | "PM" | null
  supervisorNote?: string | null
  calendarProviderConnected?: string | null
}

interface RejectedCtx extends BaseLeaveCtx {
  type: "REJECTED"
  employeeName: string
  supervisorName: string
  supervisorEmail: string
  leaveTypeName: string
  startDate: Date
  endDate: Date
  rejectionReason: string
}

interface SupervisorProposalCtx extends BaseLeaveCtx {
  type: "SUPERVISOR_PROPOSAL"
  supervisorName: string
  leaveTypeName: string
  originalStart: Date
  originalEnd: Date
  originalDays: number
  proposedStart: Date
  proposedEnd: Date
  proposedDays: number
  message: string
  agreeToken: string
  disagreeToken: string
}

interface EmployeeCounterCtx extends BaseLeaveCtx {
  type: "EMPLOYEE_COUNTER"
  employeeName: string
  leaveTypeName: string
  originalStart: Date
  originalEnd: Date
  supervisorProposedStart: Date
  supervisorProposedEnd: Date
  employeeProposedStart: Date
  employeeProposedEnd: Date
  employeeProposedDays: number
  message: string
  approveToken: string
}

interface ProposalAgreedCtx extends BaseLeaveCtx {
  type: "PROPOSAL_AGREED"
  employeeName: string
  leaveTypeName: string
  finalStart: Date
  finalEnd: Date
  totalDays: number
}

export type LeaveEmailContext =
  | RequestSubmittedCtx
  | ReminderPendingCtx
  | ApprovedCtx
  | RejectedCtx
  | SupervisorProposalCtx
  | EmployeeCounterCtx
  | ProposalAgreedCtx

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function sendLeaveEmail(ctx: LeaveEmailContext): Promise<void> {
  const tpl = renderTemplate(ctx)
  const eventType = ctx.type as LeaveEmailType

  // Always create the audit row, even if the SMTP call fails — we want
  // to know we attempted to send. Mark it after the actual send.
  const audit = await prisma.leaveEmailEvent.create({
    data: {
      leaveRequestId: ctx.leaveRequestId,
      toEmail: ctx.to.email,
      toUserId: ctx.to.userId,
      emailType: eventType,
      subject: tpl.subject,
    },
  })

  // In-app bell notification for the recipient. Best-effort — if the user
  // doesn't exist or has notifyInApp=false we just skip.
  if (ctx.to.userId) {
    try {
      const profile = await prisma.userProfile.findUnique({
        where: { userId: ctx.to.userId },
        select: { notifyInApp: true },
      })
      const wantsInApp = profile?.notifyInApp ?? true
      if (wantsInApp) {
        await prisma.notification.create({
          data: {
            userId: ctx.to.userId,
            type: `LEAVE_${eventType}`,
            message: shortMessage(ctx),
            channel: "IN_APP",
          },
        })
      }
    } catch (err) {
      console.warn("[leave-email] in-app notification create failed", err)
    }
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === "placeholder") {
    // No real SMTP configured — log and exit. Audit row already exists so
    // we don't lose visibility.
    console.warn(`[leave-email] RESEND_API_KEY missing; would have sent ${ctx.type} to ${ctx.to.email}`)
    return
  }

  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: FROM,
      to: ctx.to.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      replyTo: ctx.replyTo,
      attachments: tpl.icsAttachment
        ? [
            {
              filename: tpl.icsAttachment.filename,
              content: Buffer.from(tpl.icsAttachment.content, "utf8").toString("base64"),
            },
          ]
        : undefined,
    })
  } catch (err) {
    console.error(`[leave-email] failed to send ${ctx.type}`, err)
    // Mark the audit row so admins can see the failure.
    await prisma.leaveEmailEvent.update({
      where: { id: audit.id },
      data: { actionTaken: "SEND_FAILED" },
    })
  }
}

// ---------------------------------------------------------------------------
// Template rendering
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  icsAttachment?: { filename: string; content: string }
}

// Exported for unit testing. Pure function — no DB / network access.
export function renderTemplate(ctx: LeaveEmailContext): RenderedEmail {
  switch (ctx.type) {
    case "REQUEST_SUBMITTED":
      return renderRequest(ctx)
    case "REMINDER_PENDING":
      return renderReminderPending(ctx)
    case "APPROVED":
      return renderApproved(ctx)
    case "REJECTED":
      return renderRejected(ctx)
    case "SUPERVISOR_PROPOSAL":
      return renderProposal(ctx)
    case "EMPLOYEE_COUNTER":
      return renderCounter(ctx)
    case "PROPOSAL_AGREED":
      return renderAgreed(ctx)
  }
}

// ---- Shared layout helpers ------------------------------------------------

const COLORS = {
  bg: "#F9FAFB",
  card: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  accent: "#0B1E3F",
  green: "#10B981",
  red: "#EF4444",
  blue: "#3B82F6",
  orange: "#F59E0B",
} as const

function shell(inner: string, organizationName?: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${COLORS.text}">
<table role="presentation" width="100%" style="background:${COLORS.bg};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="560" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:1px solid ${COLORS.border};background:${COLORS.accent};color:#fff;font-weight:600;font-size:14px;letter-spacing:.02em">FLUX.AI · Leave</td></tr>
<tr><td style="padding:24px">${inner}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${COLORS.border};font-size:12px;color:${COLORS.muted}">
You're receiving this because you're registered on ${organizationName ?? "FLUX.AI"} HRMS.<br>
Manage notifications in your <a href="${APP}/profile" style="color:${COLORS.muted}">profile settings</a>.
</td></tr></table></td></tr></table></body></html>`
}

function btn(label: string, href: string, color: string): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;min-width:160px;text-align:center">${label}</a>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:${COLORS.muted};font-size:13px;width:140px">${label}</td>
    <td style="padding:6px 0;font-size:14px">${value}</td>
  </tr>`
}

function fmt(d: Date): string {
  // Always format in UTC for emails to avoid surprises across recipients.
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${day} ${months[m - 1]} ${y}`
}

function range(start: Date, end: Date): string {
  return start.toDateString() === end.toDateString()
    ? fmt(start)
    : `${fmt(start)} – ${fmt(end)}`
}

// ---- Templates ------------------------------------------------------------

function renderRequest(ctx: RequestSubmittedCtx): RenderedEmail {
  const approveUrl = buildActionUrl(ctx.approveToken)
  const rejectUrl = buildActionUrl(ctx.rejectToken)
  const portalUrl = `${APP}/approver/leave`

  const subject = `[Action Required] Leave Request: ${ctx.employeeName} — ${ctx.leaveTypeName}, ${range(ctx.startDate, ctx.endDate)}`

  const inner = `
    <p style="margin:0 0 8px;font-size:13px;color:${COLORS.muted}">New leave request</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${esc(ctx.employeeName)} requested ${ctx.totalDays} day(s) of ${esc(ctx.leaveTypeName)}</h1>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">
      ${row("Leave type", esc(ctx.leaveTypeName))}
      ${row("Dates", range(ctx.startDate, ctx.endDate))}
      ${row("Total days", String(ctx.totalDays))}
      ${ctx.reason ? row("Reason", esc(ctx.reason)) : ""}
    </table>
    <div style="margin:24px 0">
      ${btn("✓ Approve Leave", approveUrl, COLORS.green)}
      <span style="display:inline-block;width:12px"></span>
      ${btn("✕ Reject with Reason", rejectUrl, COLORS.red)}
    </div>
    <p style="margin:8px 0;font-size:13px"><a href="${portalUrl}" style="color:${COLORS.blue}">Prefer to review in the portal? View Request →</a></p>
    <p style="margin:24px 0 0;font-size:12px;color:${COLORS.muted}">These links expire in 72 hours. If expired, please open the portal to act on this request.</p>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `${ctx.employeeName} requested ${ctx.totalDays} day(s) of ${ctx.leaveTypeName} on ${range(ctx.startDate, ctx.endDate)}.\n\nApprove: ${approveUrl}\nReject:  ${rejectUrl}\n\n(Or open the portal: ${portalUrl})`,
  }
}

function renderReminderPending(ctx: ReminderPendingCtx): RenderedEmail {
  // Same payload as REQUEST_SUBMITTED with a clearer subject + reminder note.
  const baseRender = renderRequest({
    ...ctx,
    type: "REQUEST_SUBMITTED",
  })
  const subject = `[Reminder] Leave Request Awaiting Your Approval (${ctx.daysWaiting} day${ctx.daysWaiting === 1 ? "" : "s"})`
  // Inject a reminder banner at the top of the body.
  const banner = `<div style="background:#FEF3C7;border:1px solid #F59E0B;color:#92400E;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px"><strong>Reminder:</strong> this request was submitted ${ctx.daysWaiting} day${ctx.daysWaiting === 1 ? "" : "s"} ago and is still waiting for your decision. The original action links may have expired — these are fresh.</div>`
  const html = baseRender.html.replace(
    `<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">`,
    `${banner}<table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">`
  )
  return { ...baseRender, subject, html, text: `[Reminder] ${baseRender.text}` }
}

function renderApproved(ctx: ApprovedCtx): RenderedEmail {
  const subject = `Leave Approved: ${ctx.leaveTypeName} ${range(ctx.startDate, ctx.endDate)}`
  const portalUrl = `${APP}/employee/leave`

  // Build attached .ics
  const icsEvt: IcsEvent = ctx.isHalfDay && ctx.halfDayPeriod
    ? {
        uid: `leave-${ctx.leaveRequestId}@flux.ai`,
        summary: `${ctx.leaveTypeName} (${ctx.halfDayPeriod})`,
        description: `${ctx.totalDays} day(s) of ${ctx.leaveTypeName}`,
        ...halfDayWindow(ctx.startDate, ctx.halfDayPeriod),
      }
    : {
        uid: `leave-${ctx.leaveRequestId}@flux.ai`,
        summary: ctx.leaveTypeName,
        description: `${ctx.totalDays} day(s) of ${ctx.leaveTypeName}`,
        start: ctx.startDate,
        // RFC-5545: end is exclusive for all-day events. Bump by 1 day.
        end: new Date(Date.UTC(ctx.endDate.getUTCFullYear(), ctx.endDate.getUTCMonth(), ctx.endDate.getUTCDate() + 1)),
        allDay: true,
      }

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${COLORS.green}">✓ Leave approved</h1>
    <p style="margin:0 0 16px;font-size:14px">Hi ${esc(ctx.employeeName)}, your leave has been approved.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">
      ${row("Leave type", esc(ctx.leaveTypeName))}
      ${row("Dates", range(ctx.startDate, ctx.endDate) + (ctx.isHalfDay ? ` (${ctx.halfDayPeriod})` : ""))}
      ${row("Total days", String(ctx.totalDays))}
    </table>
    ${ctx.supervisorNote ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${COLORS.green};background:#F0FDF4;font-size:14px">${esc(ctx.supervisorNote)}</blockquote>` : ""}
    <p style="margin:8px 0;font-size:13px;color:${COLORS.muted}">A calendar invitation (.ics) is attached.${ctx.calendarProviderConnected ? ` This event has also been added to your ${ctx.calendarProviderConnected} Calendar.` : ""}</p>
    <div style="margin:24px 0">${btn("View in Portal", portalUrl, COLORS.accent)}</div>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `Your ${ctx.leaveTypeName} leave for ${range(ctx.startDate, ctx.endDate)} has been approved.\n\n${ctx.supervisorNote ? `Note: ${ctx.supervisorNote}\n\n` : ""}View: ${portalUrl}`,
    icsAttachment: { filename: "leave.ics", content: buildIcs(icsEvt) },
  }
}

function renderRejected(ctx: RejectedCtx): RenderedEmail {
  const subject = `Leave Request Not Approved: ${ctx.leaveTypeName} ${range(ctx.startDate, ctx.endDate)}`
  const newRequestUrl = `${APP}/employee/leave?new=1`
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${COLORS.red}">✕ Leave not approved</h1>
    <p style="margin:0 0 16px;font-size:14px">Hi ${esc(ctx.employeeName)}, your ${esc(ctx.leaveTypeName)} request for ${range(ctx.startDate, ctx.endDate)} was not approved.</p>
    <p style="margin:16px 0 4px;font-size:13px;color:${COLORS.muted}">Reason from ${esc(ctx.supervisorName)}:</p>
    <blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${COLORS.red};background:#FEF2F2;font-size:14px;font-style:italic">${esc(ctx.rejectionReason)}</blockquote>
    <div style="margin:24px 0">
      ${btn("Submit a New Request", newRequestUrl, COLORS.accent)}
      <span style="display:inline-block;width:12px"></span>
      ${btn("Contact Supervisor", `mailto:${ctx.supervisorEmail}`, COLORS.muted)}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:${COLORS.muted}">If you believe this was an error, please speak to your supervisor or HR.</p>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `Your ${ctx.leaveTypeName} request (${range(ctx.startDate, ctx.endDate)}) was not approved.\n\nReason from ${ctx.supervisorName}:\n"${ctx.rejectionReason}"\n\nSubmit a new request: ${newRequestUrl}`,
  }
}

function renderProposal(ctx: SupervisorProposalCtx): RenderedEmail {
  const subject = `Date Change Proposed for Your Leave: ${ctx.leaveTypeName} ${range(ctx.originalStart, ctx.originalEnd)}`
  const agreeUrl = buildActionUrl(ctx.agreeToken)
  const disagreeUrl = buildActionUrl(ctx.disagreeToken)
  const portalUrl = `${APP}/employee/leave`

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${COLORS.orange}">📅 Date change proposed</h1>
    <p style="margin:0 0 16px;font-size:14px">${esc(ctx.supervisorName)} has reviewed your leave request and would like to suggest different dates.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden">
      <tr style="background:#F9FAFB"><td style="padding:8px 12px;font-size:12px;color:${COLORS.muted};width:50%">Your request</td><td style="padding:8px 12px;font-size:12px;color:${COLORS.muted}">Proposed by supervisor</td></tr>
      <tr><td style="padding:8px 12px;font-size:14px">${range(ctx.originalStart, ctx.originalEnd)}</td><td style="padding:8px 12px;font-size:14px;color:${COLORS.orange};font-weight:600">${range(ctx.proposedStart, ctx.proposedEnd)}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:${COLORS.muted}">${ctx.originalDays} day(s)</td><td style="padding:8px 12px;font-size:13px;color:${COLORS.muted}">${ctx.proposedDays} day(s)</td></tr>
    </table>
    <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${COLORS.orange};background:#FFFBEB;font-size:14px">${esc(ctx.message)}</blockquote>
    <div style="margin:24px 0">
      ${btn("✓ Accept Proposed Dates", agreeUrl, COLORS.green)}
      <span style="display:inline-block;width:12px"></span>
      ${btn("⟲ Suggest Different Dates", disagreeUrl, COLORS.blue)}
    </div>
    <p style="margin:8px 0;font-size:13px"><a href="${portalUrl}" style="color:${COLORS.blue}">View full thread in portal →</a></p>
    <p style="margin:24px 0 0;font-size:12px;color:${COLORS.muted}">Links expire in 72 hours.</p>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `${ctx.supervisorName} suggests new dates for your ${ctx.leaveTypeName} leave.\n\nYour request: ${range(ctx.originalStart, ctx.originalEnd)}\nProposed:    ${range(ctx.proposedStart, ctx.proposedEnd)}\n\nReason: ${ctx.message}\n\nAccept:   ${agreeUrl}\nSuggest:  ${disagreeUrl}`,
  }
}

function renderCounter(ctx: EmployeeCounterCtx): RenderedEmail {
  const subject = `Counter-Proposal: ${ctx.employeeName} Suggests Different Dates`
  const approveUrl = buildActionUrl(ctx.approveToken)
  const portalUrl = `${APP}/approver/leave`
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600">💬 Counter-proposal received</h1>
    <p style="margin:0 0 16px;font-size:14px">${esc(ctx.employeeName)} has reviewed your proposed dates and suggests an alternative.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0;border:1px solid ${COLORS.border};border-radius:8px;overflow:hidden">
      <tr style="background:#F9FAFB">
        <td style="padding:8px 12px;font-size:12px;color:${COLORS.muted}">Original request</td>
        <td style="padding:8px 12px;font-size:12px;color:${COLORS.muted}">You proposed</td>
        <td style="padding:8px 12px;font-size:12px;color:${COLORS.muted}">Employee suggests</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-size:13px">${range(ctx.originalStart, ctx.originalEnd)}</td>
        <td style="padding:8px 12px;font-size:13px">${range(ctx.supervisorProposedStart, ctx.supervisorProposedEnd)}</td>
        <td style="padding:8px 12px;font-size:13px;color:${COLORS.blue};font-weight:600">${range(ctx.employeeProposedStart, ctx.employeeProposedEnd)}</td>
      </tr>
    </table>
    <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid ${COLORS.blue};background:#EFF6FF;font-size:14px">${esc(ctx.message)}</blockquote>
    <div style="margin:24px 0">
      ${btn("✓ Approve Employee's Suggestion", approveUrl, COLORS.green)}
      <span style="display:inline-block;width:12px"></span>
      ${btn("Open Portal", portalUrl, COLORS.accent)}
    </div>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `${ctx.employeeName} counter-proposed: ${range(ctx.employeeProposedStart, ctx.employeeProposedEnd)}\n\nReason: ${ctx.message}\n\nApprove: ${approveUrl}\nPortal: ${portalUrl}`,
  }
}

function renderAgreed(ctx: ProposalAgreedCtx): RenderedEmail {
  const subject = `Leave Dates Confirmed: ${ctx.employeeName} — ${range(ctx.finalStart, ctx.finalEnd)}`
  const portalUrl = `${APP}/employee/leave`
  const ics = buildIcs({
    uid: `leave-${ctx.leaveRequestId}@flux.ai`,
    summary: ctx.leaveTypeName,
    description: `${ctx.totalDays} day(s) of ${ctx.leaveTypeName}`,
    start: ctx.finalStart,
    end: new Date(Date.UTC(ctx.finalEnd.getUTCFullYear(), ctx.finalEnd.getUTCMonth(), ctx.finalEnd.getUTCDate() + 1)),
    allDay: true,
  })
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${COLORS.green}">🤝 Dates confirmed</h1>
    <p style="margin:0 0 16px;font-size:14px">After negotiation, the following leave dates are confirmed for ${esc(ctx.employeeName)}.</p>
    <table role="presentation" width="100%" style="border-collapse:collapse;margin:16px 0">
      ${row("Leave type", esc(ctx.leaveTypeName))}
      ${row("Final dates", range(ctx.finalStart, ctx.finalEnd))}
      ${row("Total days", String(ctx.totalDays))}
    </table>
    <p style="margin:8px 0;font-size:13px;color:${COLORS.muted}">A calendar invitation (.ics) is attached.</p>
    <div style="margin:24px 0">${btn("View in Portal", portalUrl, COLORS.accent)}</div>
  `
  return {
    subject,
    html: shell(inner, ctx.organizationName),
    text: `Leave confirmed for ${ctx.employeeName}: ${range(ctx.finalStart, ctx.finalEnd)} (${ctx.totalDays} day(s) of ${ctx.leaveTypeName}).\n\nView: ${portalUrl}`,
    icsAttachment: { filename: "leave.ics", content: ics },
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Short, plain-text summary suitable for the in-app notification bell.
 * No HTML — bell renders raw strings.
 */
function shortMessage(ctx: LeaveEmailContext): string {
  switch (ctx.type) {
    case "REQUEST_SUBMITTED":
      return `New leave request from ${ctx.employeeName}: ${ctx.leaveTypeName}, ${range(ctx.startDate, ctx.endDate)} (${ctx.totalDays} day${ctx.totalDays === 1 ? "" : "s"})`
    case "REMINDER_PENDING":
      return `[Reminder] ${ctx.employeeName}'s ${ctx.leaveTypeName} request is still awaiting your decision (${ctx.daysWaiting} day${ctx.daysWaiting === 1 ? "" : "s"})`
    case "APPROVED":
      return `Your ${ctx.leaveTypeName} leave was approved (${range(ctx.startDate, ctx.endDate)})`
    case "REJECTED":
      return `Your ${ctx.leaveTypeName} request (${range(ctx.startDate, ctx.endDate)}) was not approved.`
    case "SUPERVISOR_PROPOSAL":
      return `${ctx.supervisorName} suggests new dates for your ${ctx.leaveTypeName} leave: ${range(ctx.proposedStart, ctx.proposedEnd)}`
    case "EMPLOYEE_COUNTER":
      return `${ctx.employeeName} counter-proposed: ${range(ctx.employeeProposedStart, ctx.employeeProposedEnd)}`
    case "PROPOSAL_AGREED":
      return `Leave dates confirmed: ${range(ctx.finalStart, ctx.finalEnd)} (${ctx.totalDays} day${ctx.totalDays === 1 ? "" : "s"})`
  }
}

// ---------------------------------------------------------------------------
// Helper: generate the standard token pair for a leave request.
// ---------------------------------------------------------------------------

export function generateLeaveActionTokens(leaveRequestId: string, supervisorUserId: string) {
  const expiresAt = Date.now() + (Number(process.env.EMAIL_TOKEN_TTL_HOURS) || 72) * 3600_000
  return {
    approveToken: generateToken({
      action: "APPROVE_LEAVE",
      resourceId: leaveRequestId,
      resourceType: "LEAVE",
      userId: supervisorUserId,
      expiresAt,
    }),
    rejectToken: generateToken({
      action: "REJECT_LEAVE",
      resourceId: leaveRequestId,
      resourceType: "LEAVE",
      userId: supervisorUserId,
      expiresAt,
    }),
    tokenExpiresAt: new Date(expiresAt),
  }
}

export function generateProposalActionTokens(proposalId: string, recipientUserId: string) {
  const expiresAt = Date.now() + (Number(process.env.EMAIL_TOKEN_TTL_HOURS) || 72) * 3600_000
  return {
    agreeToken: generateToken({
      action: "AGREE_PROPOSAL",
      resourceId: proposalId,
      resourceType: "PROPOSAL",
      userId: recipientUserId,
      expiresAt,
    }),
    disagreeToken: generateToken({
      action: "DISAGREE_PROPOSAL",
      resourceId: proposalId,
      resourceType: "PROPOSAL",
      userId: recipientUserId,
      expiresAt,
    }),
    tokenExpiresAt: new Date(expiresAt),
  }
}

// Re-export for convenience
export type { TokenAction }
