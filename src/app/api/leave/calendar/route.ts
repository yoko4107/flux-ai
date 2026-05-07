import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildIcs, halfDayWindow, type IcsEvent } from "@/lib/calendar/ics"
import { verifyToken, generateToken } from "@/lib/email-tokens"

// GET /api/leave/calendar
//   Returns an .ics file containing every APPROVED leave for the caller.
//   Authentication accepts either an active session (employee downloads
//   their own feed) OR a `?t=<token>` query parameter for calendar
//   subscription URLs (Google / Apple / Outlook periodically refetches
//   without sending cookies).
//
// GET /api/leave/calendar?subscribe=1
//   Authenticated route — returns a JSON payload with a long-lived signed
//   subscription URL the user can paste into their calendar app.

const FEED_TTL_HOURS = 24 * 365 // 1-year subscription token; user can rotate.

async function userIdFromRequest(req: NextRequest): Promise<string | null> {
  const tokenParam = new URL(req.url).searchParams.get("t")
  if (tokenParam) {
    const decoded = verifyToken(tokenParam)
    // Calendar feed tokens reuse the same signing infra. We tag them as
    // CALENDAR-feed via a synthetic action to keep them distinct from
    // approve/reject tokens.
    if (decoded && decoded.action === "CALENDAR_FEED") {
      return decoded.userId
    }
    return null
  }
  const session = await auth()
  return session?.user?.id ?? null
}

export async function GET(req: NextRequest) {
  const subscribe = new URL(req.url).searchParams.get("subscribe") === "1"
  if (subscribe) {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // Sign a long-lived feed token bound to the caller.
    const token = generateToken({
      action: "CALENDAR_FEED",
      resourceId: session.user.id,
      resourceType: "LEAVE",
      userId: session.user.id,
      expiresAt: Date.now() + FEED_TTL_HOURS * 3600_000,
    })
    const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
    return NextResponse.json({
      url: `${base}/api/leave/calendar?t=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + FEED_TTL_HOURS * 3600_000).toISOString(),
    })
  }

  const userId = await userIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: userId, status: "APPROVED" },
    include: { leaveType: { select: { name: true } } },
    orderBy: { startDate: "asc" },
  })

  const events: IcsEvent[] = requests.map((r) => {
    if (r.isHalfDay && r.halfDayPeriod) {
      return {
        uid: `leave-${r.id}@flux.ai`,
        summary: `${r.leaveType.name} (${r.halfDayPeriod})`,
        description: `${r.totalDays} day(s) of ${r.leaveType.name}`,
        ...halfDayWindow(r.startDate, r.halfDayPeriod as "AM" | "PM"),
      }
    }
    // RFC-5545: end is exclusive for all-day events.
    const endExclusive = new Date(Date.UTC(
      r.endDate.getUTCFullYear(), r.endDate.getUTCMonth(), r.endDate.getUTCDate() + 1
    ))
    return {
      uid: `leave-${r.id}@flux.ai`,
      summary: r.leaveType.name,
      description: `${r.totalDays} day(s) of ${r.leaveType.name}`,
      start: r.startDate,
      end: endExclusive,
      allDay: true,
    }
  })

  // The buildIcs helper is single-event; concatenate manually for the feed.
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FLUX.AI//Leave Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:FLUX.AI Leave",
  ].join("\r\n")
  const tail = "END:VCALENDAR"
  const middle = events.map((evt) => {
    // Reuse buildIcs by stripping its CALENDAR wrapper.
    const wrapped = buildIcs(evt)
    return wrapped.split("\r\n").slice(5, -1).join("\r\n") // drop BEGIN:VCALENDAR..METHOD and END:VCALENDAR
  }).join("\r\n")
  const body = [head, middle, tail].filter(Boolean).join("\r\n")

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="flux-leave.ics"',
      "Cache-Control": "no-store",
    },
  })
}
