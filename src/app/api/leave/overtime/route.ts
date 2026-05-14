import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"
import { getOvertimePolicy } from "@/lib/leave-policy"

// Overtime ledger.
// Supervisor / admin creates an OT record for an employee. The configured
// per-day-type multiplier converts hours worked into lieu-days earned, which
// can later be redeemed via the COMPENSATORY leave type.
//
// Defaults follow the Vietnamese OT rules cited in the spec
// (weekday ×1.5, weekend ×2.0, public holiday ×3.0). 8 hours of work at
// multiplier M earns 1×M lieu days. Lieu days expire 6 months from the OT date.
//
// Status: APPROVED on creation (supervisor is the authority). Admin can
// reject later via PATCH if they need to correct an entry.

const Body = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hoursWorked: z.number().min(0.25).max(24),
  notes: z.string().max(2000).optional(),
})

const HOURS_PER_DAY = 8

// ISO weekday: 0=Sun .. 6=Sat. Treat Sat/Sun as WEEKEND.
function dayTypeFor(date: Date, holidaySet: Set<string>, policy: { weekday: number; weekend: number; publicHoliday: number }) {
  const key = date.toISOString().slice(0, 10)
  if (holidaySet.has(key)) return { dayType: "PUBLIC_HOLIDAY" as const, multiplier: policy.publicHoliday }
  const dow = date.getUTCDay()
  if (dow === 0 || dow === 6) return { dayType: "WEEKEND" as const, multiplier: policy.weekend }
  return { dayType: "WEEKDAY" as const, multiplier: policy.weekday }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Only supervisors / admins can log OT for someone.
  if (!["APPROVER", "ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  const { employeeId, date, hoursWorked, notes } = parsed.data

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, email: true, organizationId: true, managerId: true },
  })
  if (!employee || !employee.organizationId) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 })
  }
  // APPROVER can only log OT for their own subordinates.
  if (session.user.role === "APPROVER" && employee.managerId !== session.user.id) {
    return NextResponse.json({ error: "You can only log overtime for your direct reports" }, { status: 403 })
  }
  // ADMIN can only log OT within their own organisation.
  if (session.user.role === "ADMIN" && employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "You can only log overtime within your organisation" }, { status: 403 })
  }

  const dateUtc = utcDateOnly(date)
  const policy = await getOvertimePolicy(employee.organizationId)
  const holidays = await prisma.publicHoliday.findMany({
    where: { organizationId: employee.organizationId, date: dateUtc },
    select: { date: true },
  })
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)))
  const { dayType, multiplier } = dayTypeFor(dateUtc, holidaySet, policy)
  const lieuDaysEarned = Number(((hoursWorked / HOURS_PER_DAY) * multiplier).toFixed(2))
  const lieuExpiryMs = policy.lieuExpiryMonths * 30 * 24 * 60 * 60 * 1000

  const record = await prisma.overtimeRecord.create({
    data: {
      organizationId: employee.organizationId,
      employeeId,
      supervisorId: session.user.id,
      date: dateUtc,
      hoursWorked,
      dayType,
      multiplier,
      lieuDaysEarned,
      lieuExpiresAt: new Date(Date.now() + lieuExpiryMs),
      notes: notes ?? null,
      status: "APPROVED",
    },
  })

  // Notify employee (in-app via existing notifications, plus a one-shot
  // email if RESEND is configured — kept minimal).
  if (employee.email && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "placeholder") {
    try {
      const { Resend } = await import("resend")
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>",
        to: employee.email,
        subject: `Overtime logged: ${dateUtc.toISOString().slice(0, 10)} — ${lieuDaysEarned.toFixed(2)} lieu days`,
        html: `<p>Hi ${employee.name ?? ""},</p><p>Overtime has been logged on your behalf:</p><ul><li>Date: ${dateUtc.toISOString().slice(0, 10)} (${dayType})</li><li>Hours worked: ${hoursWorked}</li><li>Multiplier: ×${multiplier}</li><li>Lieu days credited: <strong>${lieuDaysEarned.toFixed(2)}</strong> (expires ${new Date(Date.now() + lieuExpiryMs).toISOString().slice(0, 10)})</li></ul><p>You can redeem them via Compensatory leave.</p>`,
      })
    } catch (err) {
      console.error("[overtime] email send failed", err)
    }
  }

  return NextResponse.json({ record }, { status: 201 })
}

// GET /api/leave/overtime — list records visible to caller.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgId = session.user.organizationId
  const role = session.user.role
  const url = new URL(req.url)
  const employeeId = url.searchParams.get("employeeId")

  const costCenterId = url.searchParams.get("costCenterId")

  const where: Record<string, unknown> = {}
  if (role === "ADMIN" && orgId) where.organizationId = orgId
  else if (role === "APPROVER") where.supervisorId = session.user.id
  else where.employeeId = session.user.id
  if (employeeId) where.employeeId = employeeId
  if (costCenterId && (role === "ADMIN" || role === "SUPER_ADMIN")) {
    where.employee = { costCenterId }
  }

  const records = await prisma.overtimeRecord.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ records })
}
