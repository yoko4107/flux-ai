import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"

// GET /api/leave/events?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Returns all company / special events overlapping the window for the
//   caller's org. Read-only for everyone in the org.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.organizationId) return NextResponse.json({ events: [] })

  const url = new URL(req.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")

  // Same overlap rule as leave-requests: event.start <= to AND event.end >= from
  const where: Record<string, unknown> = { organizationId: session.user.organizationId }
  if (to) (where as Record<string, unknown>).startDate = { lte: utcDateOnly(to) }
  if (from) (where as Record<string, unknown>).endDate = { gte: utcDateOnly(from) }

  const events = await prisma.companyEvent.findMany({
    where,
    orderBy: { startDate: "asc" },
  })
  return NextResponse.json({ events })
}
