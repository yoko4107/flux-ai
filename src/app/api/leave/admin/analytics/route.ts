import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/leave/admin/analytics — high-level KPIs for the admin dashboard.
//   - count by status
//   - negotiation rate (% of resolved requests that had ≥1 proposal)
//   - average time-to-resolution (days)
//   - top leave types by approved-day count

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const orgFilter =
    session.user.role === "ADMIN" && session.user.organizationId
      ? { organizationId: session.user.organizationId }
      : {}

  const [requests, leaveTypes] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: orgFilter,
      include: {
        proposals: { select: { id: true } },
        leaveType: { select: { id: true, name: true } },
      },
    }),
    prisma.leaveType.findMany({
      where: orgFilter,
      select: { id: true, name: true, colorHex: true },
    }),
  ])

  const byStatus: Record<string, number> = {}
  let resolved = 0
  let resolvedWithNegotiation = 0
  let totalResolutionDays = 0
  const daysByType: Record<string, number> = {}

  for (const r of requests) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (r.status === "APPROVED" || r.status === "REJECTED") {
      resolved++
      if (r.proposals.length > 0) resolvedWithNegotiation++
      totalResolutionDays += (r.updatedAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    }
    if (r.status === "APPROVED") {
      daysByType[r.leaveTypeId] = (daysByType[r.leaveTypeId] ?? 0) + r.totalDays
    }
  }

  const topLeaveTypes = leaveTypes
    .map((lt) => ({ ...lt, days: daysByType[lt.id] ?? 0 }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5)

  return NextResponse.json({
    byStatus,
    totalRequests: requests.length,
    negotiationRate: resolved > 0 ? resolvedWithNegotiation / resolved : 0,
    avgResolutionDays: resolved > 0 ? totalResolutionDays / resolved : 0,
    topLeaveTypes,
  })
}
