import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/leave/holidays?year=2026
// Returns all public holidays for the caller's organization (and country)
// for the given year, used by the leave-request date picker to grey out
// non-working days.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.organizationId) return NextResponse.json({ holidays: [] })

  const yearParam = new URL(req.url).searchParams.get("year")
  const year = yearParam ? Number(yearParam) : new Date().getUTCFullYear()
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 })
  }

  const holidays = await prisma.publicHoliday.findMany({
    where: {
      organizationId: session.user.organizationId,
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    },
    orderBy: { date: "asc" },
  })
  return NextResponse.json({ holidays })
}
