import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"

// GET /api/leave/admin/email-audit
//   ?type=APPROVED                — filter by emailType (one of LeaveEmailType values)
//   ?to=alice@example.com         — exact-match recipient
//   ?action=APPROVED|EXPIRED|...  — filter by actionTaken; 'unread' for null
//   ?from=YYYY-MM-DD              — sentAt >= midnight UTC
//   ?to_date=YYYY-MM-DD           — sentAt <= 23:59:59 UTC
//   ?limit=200                    — caps at 500
//
// Admin sees all leave emails sent within their organization (joined through
// LeaveRequest.organizationId). Super-admin sees everything across orgs.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const limit = Math.min(500, Number(params.get("limit")) || 100)
  const typeParam = params.get("type")
  const toParam = params.get("to")
  const actionParam = params.get("action")
  const fromDate = params.get("from")
  const toDate = params.get("to_date")
  const costCenterId = params.get("costCenterId")

  const where: Prisma.LeaveEmailEventWhereInput = {}

  if (session.user.role === "ADMIN" && session.user.organizationId) {
    where.leaveRequest = { organizationId: session.user.organizationId }
  }
  if (costCenterId) {
    where.leaveRequest = {
      ...(where.leaveRequest as object ?? {}),
      employee: { costCenterId },
    }
  }

  if (typeParam) {
    where.emailType = typeParam as Prisma.LeaveEmailEventWhereInput["emailType"]
  }
  if (toParam) where.toEmail = toParam
  if (actionParam === "unread") {
    where.actionTaken = null
  } else if (actionParam) {
    where.actionTaken = actionParam
  }
  if (fromDate || toDate) {
    where.sentAt = {}
    if (fromDate) (where.sentAt as Prisma.DateTimeFilter).gte = new Date(`${fromDate}T00:00:00Z`)
    if (toDate) (where.sentAt as Prisma.DateTimeFilter).lte = new Date(`${toDate}T23:59:59Z`)
  }

  const events = await prisma.leaveEmailEvent.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: limit,
    include: {
      leaveRequest: {
        select: {
          id: true,
          status: true,
          employee: { select: { name: true, email: true } },
          leaveType: { select: { name: true } },
        },
      },
    },
  })
  return NextResponse.json({ events, total: events.length, limit })
}
