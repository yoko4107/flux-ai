import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"

// Work-location daily log.
//   - Employees record where they're working: OFFICE / WFH / WFS (off-site).
//   - Supervisors / admins can see their team's locations for the day.

// Caller may submit either a single date or a startDate / endDate range.
// We accept both shapes for backward compatibility — the modal upgrades to
// always pass start/end, but the legacy single-date payload still works.
const Body = z.object({
  // legacy single-day submission
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // new range submission (endDate optional → same as startDate)
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  locationType: z.enum(["OFFICE", "WFH", "WFS"]),
  locationName: z.string().max(120).optional(),
  locationAddress: z.string().max(400).optional(),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().email().max(120).optional(),
  notes: z.string().max(2000).optional(),
  // If true, weekends in the range are skipped. Defaults to false because
  // people sometimes log a weekend trip / WFS on a Saturday.
  skipWeekends: z.boolean().optional().default(false),
}).refine((b) => !!(b.date || b.startDate), {
  message: "Either `date` or `startDate` is required",
})

const MAX_RANGE_DAYS = 60 // sanity cap so a typo doesn't insert thousands of rows

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { organizationId: true } })
  if (!u?.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const startStr = parsed.data.startDate ?? parsed.data.date!
  const endStr = parsed.data.endDate ?? parsed.data.startDate ?? parsed.data.date!
  const start = utcDateOnly(startStr)
  const end = utcDateOnly(endStr)
  if (end < start) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
  }

  // Build the list of dates server-side so we can enforce the range cap and
  // weekend-skip rule centrally.
  const dates: Date[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    if (!parsed.data.skipWeekends || !isWeekend) {
      dates.push(new Date(cur))
    }
    cur.setUTCDate(cur.getUTCDate() + 1)
    if (dates.length > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Range exceeds ${MAX_RANGE_DAYS} days. Split into smaller ranges.` }, { status: 400 })
    }
  }
  if (dates.length === 0) {
    return NextResponse.json({ error: "Range is empty (all weekends were skipped)." }, { status: 400 })
  }

  const data = dates.map((d) => ({
    organizationId: u.organizationId!,
    employeeId: session.user.id,
    date: d,
    locationType: parsed.data.locationType,
    locationName: parsed.data.locationName,
    locationAddress: parsed.data.locationAddress,
    contactPhone: parsed.data.contactPhone,
    contactEmail: parsed.data.contactEmail,
    notes: parsed.data.notes,
  }))

  // createMany is faster than N round-trips for the multi-day case.
  await prisma.workLocationLog.createMany({ data })
  return NextResponse.json({ inserted: data.length, dates: dates.map((d) => d.toISOString().slice(0, 10)) }, { status: 201 })
}

// GET /api/leave/work-location?employeeId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Employees see only their own logs. Supervisors see direct reports.
// Admins see everything in their org.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const employeeIdParam = url.searchParams.get("employeeId")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  const where: Record<string, unknown> = {}
  if (session.user.role === "ADMIN" && session.user.organizationId) {
    where.organizationId = session.user.organizationId
  } else if (session.user.role === "APPROVER") {
    // Direct reports only.
    const reports = await prisma.user.findMany({
      where: { managerId: session.user.id },
      select: { id: true },
    })
    where.employeeId = { in: [session.user.id, ...reports.map((r) => r.id)] }
  } else {
    where.employeeId = session.user.id
  }
  if (employeeIdParam) where.employeeId = employeeIdParam
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = utcDateOnly(from)
    if (to) range.lte = utcDateOnly(to)
    where.date = range
  }

  const logs = await prisma.workLocationLog.findMany({
    where,
    orderBy: { date: "desc" },
    take: 200,
    include: { employee: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json({ logs })
}
