import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH /api/per-diem/request/[id]
//   { action: "APPROVE", supervisorNote?: string }
//   { action: "REJECT",  rejectionReason: string (≥20 chars) }
//   { action: "CANCEL" }                                    (employee only, status=PENDING)
//
// Mirrors the leave-request flow's authorization rules.

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), supervisorNote: z.string().max(2000).optional() }),
  z.object({ action: z.literal("REJECT"), rejectionReason: z.string().min(20, "Rejection reason must be at least 20 characters").max(2000) }),
  z.object({ action: z.literal("CANCEL") }),
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const action = parsed.data

  const claim = await prisma.perDiemRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
    },
  })
  if (!claim) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner = claim.employeeId === session.user.id
  const isSupervisor = claim.supervisorId === session.user.id
  const isOrgAdmin = session.user.role === "ADMIN" && claim.organizationId === session.user.organizationId
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"

  if (action.action === "CANCEL") {
    if (!isOwner) return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 })
    if (claim.status !== "PENDING") {
      return NextResponse.json({ error: `Cannot cancel a ${claim.status} claim` }, { status: 400 })
    }
    const updated = await prisma.perDiemRequest.update({ where: { id }, data: { status: "CANCELLED" } })
    return NextResponse.json(updated)
  }

  if (!isSupervisor && !isOrgAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (claim.status !== "PENDING") {
    return NextResponse.json({ error: `Cannot ${action.action.toLowerCase()} a ${claim.status} claim` }, { status: 400 })
  }

  if (action.action === "APPROVE") {
    const updated = await prisma.perDiemRequest.update({
      where: { id },
      data: { status: "APPROVED", supervisorNote: action.supervisorNote ?? null },
    })
    await notifyDecision(claim, "APPROVED", action.supervisorNote)
    return NextResponse.json(updated)
  }

  // REJECT
  const updated = await prisma.perDiemRequest.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: action.rejectionReason },
  })
  await notifyDecision(claim, "REJECTED", undefined, action.rejectionReason)
  return NextResponse.json(updated)
}

// ---------------------------------------------------------------------------
// Notify employee of approve / reject decisions.
// ---------------------------------------------------------------------------

async function notifyDecision(
  claim: {
    id: string
    employeeId: string
    employee: { id: string; name: string | null; email: string | null }
    supervisor: { id: string; name: string | null; email: string | null }
    destinationCountry: string
    destinationCity: string | null
    startDate: Date
    endDate: Date
    totalAmountUSD: { toString: () => string }
    organization: { name: string } | null
  },
  decision: "APPROVED" | "REJECTED",
  supervisorNote?: string,
  rejectionReason?: string
) {
  const where = claim.destinationCity ? `${claim.destinationCity}, ${claim.destinationCountry}` : claim.destinationCountry

  // In-app
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: claim.employeeId },
      select: { notifyInApp: true },
    })
    if (profile?.notifyInApp ?? true) {
      const msg = decision === "APPROVED"
        ? `Your per diem for ${where} ($${claim.totalAmountUSD.toString()}) was approved`
        : `Your per diem for ${where} was not approved`
      await prisma.notification.create({
        data: {
          userId: claim.employeeId,
          type: `PER_DIEM_${decision}`,
          message: msg,
          channel: "IN_APP",
        },
      })
    }
  } catch (err) {
    console.warn("[per-diem] in-app notify failed", err)
  }

  // Email
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === "placeholder") return
  if (!claim.employee.email) return
  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)
    const portal = `${process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"}/employee/per-diem`
    if (decision === "APPROVED") {
      await resend.emails.send({
        from: process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>",
        to: claim.employee.email,
        replyTo: claim.supervisor.email ?? undefined,
        subject: `Per diem approved: ${where} — $${claim.totalAmountUSD.toString()}`,
        html: `<p>Hi ${claim.employee.name ?? ""},</p>
<p>Your per diem claim has been approved.</p>
<ul>
  <li><strong>Destination:</strong> ${where}</li>
  <li><strong>Dates:</strong> ${claim.startDate.toISOString().slice(0, 10)} → ${claim.endDate.toISOString().slice(0, 10)}</li>
  <li><strong>Total:</strong> $${claim.totalAmountUSD.toString()}</li>
</ul>
${supervisorNote ? `<p><em>Note from your supervisor:</em> ${escapeHtml(supervisorNote)}</p>` : ""}
<p><a href="${portal}">View in the portal →</a></p>`,
      })
    } else {
      await resend.emails.send({
        from: process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>",
        to: claim.employee.email,
        replyTo: claim.supervisor.email ?? undefined,
        subject: `Per diem not approved: ${where}`,
        html: `<p>Hi ${claim.employee.name ?? ""},</p>
<p>Your per diem claim for ${where} (${claim.startDate.toISOString().slice(0, 10)} → ${claim.endDate.toISOString().slice(0, 10)}) was not approved.</p>
<blockquote style="border-left:3px solid #EF4444;padding:8px 14px;background:#FEF2F2"><em>${escapeHtml(rejectionReason ?? "")}</em><br/>— ${claim.supervisor.name ?? "Supervisor"}</blockquote>
<p><a href="${portal}">Submit a new claim →</a></p>`,
      })
    }
  } catch (err) {
    console.warn("[per-diem] decision email failed", err)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
