import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCarryoverPolicy, resolveCarriedDays } from "@/lib/leave-policy"

// GET /api/leave/balance/[userId]
// Returns leave balances per leave type for the given user, computed as:
//   used = sum of totalDays for APPROVED requests in the current calendar year
//   remaining = max(0, leaveType.maxDaysPerYear - used)  (null when unlimited)
//
// Authorization:
//   - employee: own balance
//   - supervisor: balance of any direct subordinate
//   - admin/super_admin: any user in their org

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { userId } = await params
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, organizationId: true, managerId: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const role = session.user.role
  const isSelf = session.user.id === userId
  const isManager = target.managerId === session.user.id
  const isOrgAdmin = role === "ADMIN" && target.organizationId === session.user.organizationId
  const isSuperAdmin = role === "SUPER_ADMIN"
  if (!isSelf && !isManager && !isOrgAdmin && !isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!target.organizationId) return NextResponse.json({ balances: [] })

  const year = new Date().getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1))

  const now = new Date()
  const lastYearStart = new Date(Date.UTC(year - 1, 0, 1))
  const lastYearEnd = yearStart
  const carryoverPolicy = await getCarryoverPolicy(target.organizationId)
  const [leaveTypes, approvedThisYear, approvedAll, lieuRecords, approvedLastYear, adjustments] = await Promise.all([
    prisma.leaveType.findMany({
      where: { organizationId: target.organizationId },
      orderBy: { name: "asc" },
    }),
    // Annual / sick / personal etc. reset each calendar year, so usage is scoped.
    prisma.leaveRequest.findMany({
      where: {
        employeeId: userId,
        status: "APPROVED",
        startDate: { gte: yearStart, lt: yearEnd },
      },
      select: { leaveTypeId: true, totalDays: true },
    }),
    // Compensatory (lieu) leave doesn't reset annually — redemption can be
    // any date and the credit pool persists across years. Track all-time.
    prisma.leaveRequest.findMany({
      where: { employeeId: userId, status: "APPROVED" },
      select: { leaveTypeId: true, totalDays: true, leaveType: { select: { code: true } } },
    }),
    prisma.overtimeRecord.findMany({
      where: {
        employeeId: userId,
        status: "APPROVED",
        OR: [{ lieuExpiresAt: null }, { lieuExpiresAt: { gt: now } }],
      },
      select: { lieuDaysEarned: true },
    }),
    // For carryover: how many days were used in the previous calendar year?
    prisma.leaveRequest.findMany({
      where: {
        employeeId: userId,
        status: "APPROVED",
        startDate: { gte: lastYearStart, lt: lastYearEnd },
      },
      select: { leaveTypeId: true, totalDays: true },
    }),
    prisma.leaveBalanceAdjustment.findMany({
      where: { employeeId: userId, year },
      select: { leaveTypeId: true, days: true },
    }),
  ])

  const usedLastYearByType = new Map<string, number>()
  for (const r of approvedLastYear) {
    usedLastYearByType.set(r.leaveTypeId, (usedLastYearByType.get(r.leaveTypeId) ?? 0) + r.totalDays)
  }
  const adjustmentByType = new Map<string, number>()
  for (const a of adjustments) {
    adjustmentByType.set(a.leaveTypeId, (adjustmentByType.get(a.leaveTypeId) ?? 0) + a.days)
  }

  const usedByType = new Map<string, number>()
  for (const r of approvedThisYear) {
    usedByType.set(r.leaveTypeId, (usedByType.get(r.leaveTypeId) ?? 0) + r.totalDays)
  }
  const usedAllTimeByType = new Map<string, number>()
  for (const r of approvedAll) {
    usedAllTimeByType.set(r.leaveTypeId, (usedAllTimeByType.get(r.leaveTypeId) ?? 0) + r.totalDays)
  }

  // Total lieu days credited (not yet expired) — used to override the
  // "remaining" value for the COMPENSATORY leave type so employees can see
  // how many lieu days they have.
  const lieuCreditTotal = lieuRecords.reduce((acc, r) => acc + r.lieuDaysEarned, 0)

  const balances = leaveTypes.map((lt) => {
    let used = usedByType.get(lt.id) ?? 0
    let maxDaysPerYear: number | null = lt.maxDaysPerYear

    // Carryover: add carried-over days from prior year on top of the cap.
    let carriedOver = 0
    if (lt.maxDaysPerYear != null) {
      const usedLast = usedLastYearByType.get(lt.id) ?? 0
      const unusedLast = Math.max(0, lt.maxDaysPerYear - usedLast)
      carriedOver = resolveCarriedDays(carryoverPolicy, lt.code, unusedLast, now)
      if (carriedOver > 0) maxDaysPerYear = lt.maxDaysPerYear + carriedOver
    }

    // Manual admin adjustments — added directly to the cap.
    const adjustmentDays = adjustmentByType.get(lt.id) ?? 0
    if (adjustmentDays !== 0 && maxDaysPerYear != null) {
      maxDaysPerYear = maxDaysPerYear + adjustmentDays
    }

    let remaining: number | null = maxDaysPerYear == null ? null : Math.max(0, maxDaysPerYear - used)

    // Compensatory leave: pool comes from the overtime ledger, not an annual
    // allowance. Usage tracked all-time so cross-year redemptions decrement
    // correctly.
    if (lt.code === "COMPENSATORY") {
      used = usedAllTimeByType.get(lt.id) ?? 0
      maxDaysPerYear = Math.round(lieuCreditTotal * 100) / 100
      remaining = Math.max(0, lieuCreditTotal - used)
      carriedOver = 0
    }
    return {
      leaveTypeId: lt.id,
      code: lt.code,
      name: lt.name,
      colorHex: lt.colorHex,
      maxDaysPerYear,
      used,
      remaining,
      carriedOver,
      adjustment: adjustmentDays,
      isPaid: lt.isPaid,
    }
  })

  return NextResponse.json({ balances, year, lieuCreditTotal })
}
