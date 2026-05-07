import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  calculateDayTotal,
  calculateTotalPerDiem,
  daysBetween,
  getRateTable,
  rateForDestination,
  utcDate,
} from "@/lib/per-diem"
import { convert } from "@/lib/fx-rates"

// POST /api/per-diem/request
// Employee submits a new per diem claim. Server resolves the daily rate,
// expands the trip into PerDiemDay rows, computes the total via the canonical
// calculator (so the client can't fudge the math), and emails the supervisor.
//
// Body shape (per-day grid is required so the user picks meals up-front):
//   {
//     destinationCountry: "VN",
//     destinationCity?: "Hanoi",
//     startDate: "2026-05-04",
//     endDate:   "2026-05-08",
//     reason?:   "Q2 customer visits",
//     days: [
//       { date: "2026-05-04", isTravelDay: true,  breakfastProvided: false, lunchProvided: false, dinnerProvided: false },
//       { date: "2026-05-05", isTravelDay: false, breakfastProvided: true,  lunchProvided: false, dinnerProvided: false },
//       …one entry per calendar day in [startDate, endDate]
//     ]
//   }

const DayInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isTravelDay: z.boolean(),
  breakfastProvided: z.boolean(),
  lunchProvided: z.boolean(),
  dinnerProvided: z.boolean(),
  // Optional manual override of the day's amount (in the request's chosen
  // currency). When present, the formula is skipped for that day.
  // Cap is generous (100M) so IDR / VND amounts work — those currencies
  // routinely run into the millions per day.
  amountOverride: z.number().min(0).max(100_000_000).nullable().optional(),
})

const Body = z.object({
  destinationCountry: z.string().regex(/^[A-Z]{2}$/),
  destinationCity: z.string().max(120).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(2000).optional(),
  // ISO-4217 currency for the claim. USD remains the canonical reporting
  // currency; the chosen-currency totals are stored alongside.
  currency: z.string().regex(/^[A-Z]{3}$/).optional().default("USD"),
  days: z.array(DayInput).min(1).max(120),
})

const MAX_TRIP_DAYS = 90

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const { destinationCountry, destinationCity, startDate, endDate, reason, days } = parsed.data

  const employee = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, organizationId: true, managerId: true },
  })
  if (!employee?.organizationId) {
    return NextResponse.json({ error: "User has no organization" }, { status: 400 })
  }
  if (!employee.managerId) {
    return NextResponse.json(
      { error: "No supervisor assigned. Ask an admin to set your manager before submitting per diem." },
      { status: 400 }
    )
  }

  const start = utcDate(startDate)
  const end = utcDate(endDate)
  if (end < start) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })
  }
  const expected = daysBetween(start, end)
  if (expected.length > MAX_TRIP_DAYS) {
    return NextResponse.json({ error: `Trip exceeds ${MAX_TRIP_DAYS} days. Split it into smaller claims.` }, { status: 400 })
  }
  // Client must supply exactly one day entry per calendar day, in order.
  if (days.length !== expected.length) {
    return NextResponse.json(
      { error: `Expected ${expected.length} day entries, got ${days.length}` },
      { status: 400 }
    )
  }
  for (let i = 0; i < expected.length; i++) {
    if (days[i].date !== expected[i].toISOString().slice(0, 10)) {
      return NextResponse.json(
        { error: `Day ${i + 1} should be ${expected[i].toISOString().slice(0, 10)}, got ${days[i].date}` },
        { status: 400 }
      )
    }
  }

  // Overlap check — refuse if the employee already has an active (PENDING
  // or APPROVED) claim that overlaps this date range.
  const overlap = await prisma.perDiemRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["PENDING", "APPROVED"] },
      // overlap rule: existing.startDate <= new.end AND existing.endDate >= new.start
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  })
  if (overlap) {
    const lo = overlap.startDate.toISOString().slice(0, 10)
    const hi = overlap.endDate.toISOString().slice(0, 10)
    return NextResponse.json(
      { error: `Overlaps an existing ${overlap.status.toLowerCase()} claim (${lo} → ${hi}). Cancel it first or pick a different range.` },
      { status: 409 }
    )
  }

  // Resolve the rate at submission time and freeze it on each PerDiemDay.
  const rates = await getRateTable(employee.organizationId)
  const { rate: baseRateUSD, isHighCost } = rateForDestination(rates, destinationCountry, destinationCity)
  if (baseRateUSD <= 0) {
    return NextResponse.json(
      { error: `No per diem rate configured for ${destinationCountry}. Ask an admin.` },
      { status: 400 }
    )
  }

  // Convert the policy USD rate into the chosen claim currency. exchangeRate
  // expresses 1 USD = N chosen-currency units, captured at submission so
  // subsequent FX moves don't retroactively alter approved claims.
  const currency = parsed.data.currency.toUpperCase()
  const conv = await convert(baseRateUSD, "USD", currency)
  const baseRateInCurrency = conv.amountBase
  // exchangeRate stored as USD→target so 1 unit USD costs N target.
  const exchangeRate = conv.exchangeRate

  // Run the canonical calculator twice: once in the chosen currency (what
  // the user sees) and once in USD (canonical reporting). Per-day overrides
  // are entered in the chosen currency; the USD column is derived back.
  const dayInputsCurrency = days.map((d) => ({
    baseRateUSD: baseRateInCurrency,
    isTravelDay: d.isTravelDay,
    breakfastProvided: d.breakfastProvided,
    lunchProvided: d.lunchProvided,
    dinnerProvided: d.dinnerProvided,
    amountOverride: d.amountOverride ?? null,
  }))
  const dayTotalsCurrency = dayInputsCurrency.map((d) => calculateDayTotal(d))
  const totalAmount = calculateTotalPerDiem(dayInputsCurrency)

  // Build the USD inputs by either:
  //   - converting the override back from chosen-currency → USD, OR
  //   - re-running the formula in USD (no override on that day).
  const dayInputsUSD = days.map((d) => {
    if (d.amountOverride != null && d.amountOverride >= 0) {
      // We can't async-convert per day cheaply; use the same exchangeRate
      // we already captured (1 USD = exchangeRate target, so 1 target = 1 / exchangeRate USD).
      const usdOverride = exchangeRate > 0 ? d.amountOverride / exchangeRate : d.amountOverride
      return {
        baseRateUSD,
        isTravelDay: d.isTravelDay,
        breakfastProvided: d.breakfastProvided,
        lunchProvided: d.lunchProvided,
        dinnerProvided: d.dinnerProvided,
        amountOverride: Math.round(usdOverride * 100) / 100,
      }
    }
    return {
      baseRateUSD,
      isTravelDay: d.isTravelDay,
      breakfastProvided: d.breakfastProvided,
      lunchProvided: d.lunchProvided,
      dinnerProvided: d.dinnerProvided,
    }
  })
  const dayTotalsUSD = dayInputsUSD.map((d) => calculateDayTotal(d))
  const totalAmountUSD = calculateTotalPerDiem(dayInputsUSD)

  const created = await prisma.perDiemRequest.create({
    data: {
      organizationId: employee.organizationId,
      employeeId: employee.id,
      supervisorId: employee.managerId,
      destinationCountry: destinationCountry.toUpperCase(),
      destinationCity: destinationCity ?? null,
      isHighCost,
      startDate: start,
      endDate: end,
      totalDays: expected.length,
      currency,
      exchangeRate,
      totalAmount,
      totalAmountUSD,
      reason: reason ?? null,
      status: "PENDING",
      days: {
        createMany: {
          data: days.map((d, i) => ({
            date: utcDate(d.date),
            baseRate: baseRateInCurrency,
            baseRateUSD,
            isTravelDay: d.isTravelDay,
            breakfastProvided: d.breakfastProvided,
            lunchProvided: d.lunchProvided,
            dinnerProvided: d.dinnerProvided,
            dailyTotal: dayTotalsCurrency[i],
            dailyTotalUSD: dayTotalsUSD[i],
            isOverride: d.amountOverride != null && d.amountOverride >= 0,
          })),
        },
      },
    },
    include: { days: { orderBy: { date: "asc" } } },
  })

  // Best-effort supervisor email + in-app notification.
  await notifySubmission(created)

  return NextResponse.json(created, { status: 201 })
}

// GET /api/per-diem/request — list claims visible to the caller.
//   Employee: own claims
//   Approver: claims where they are the supervisor
//   Admin:    everything in their org
//   SuperAdmin: everything in every org
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  const orgId = session.user.organizationId
  const url = new URL(req.url)
  const scope = url.searchParams.get("scope")
  const status = url.searchParams.get("status")

  let where: Record<string, unknown> = {}
  if (role === "SUPER_ADMIN") {
    /* no scope */
  } else if (role === "ADMIN" && orgId) {
    where.organizationId = orgId
  } else if (role === "APPROVER" || scope === "to-approve") {
    where.supervisorId = session.user.id
  } else {
    where.employeeId = session.user.id
  }
  if (scope === "mine") where = { ...where, employeeId: session.user.id }
  if (status) where.status = status

  const requests = await prisma.perDiemRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      supervisor: { select: { id: true, name: true, email: true } },
      days: { orderBy: { date: "asc" } },
    },
  })
  return NextResponse.json({ requests })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function notifySubmission(request: {
  id: string
  destinationCountry: string
  destinationCity: string | null
  startDate: Date
  endDate: Date
  totalDays: number
  currency: string
  totalAmount: { toString: () => string }
  totalAmountUSD: { toString: () => string }
  employeeId: string
  supervisorId: string
}) {
  const [employee, supervisor, organization] = await Promise.all([
    prisma.user.findUnique({ where: { id: request.employeeId }, select: { name: true, email: true } }),
    prisma.user.findUnique({ where: { id: request.supervisorId }, select: { name: true, email: true } }),
    prisma.user.findUnique({
      where: { id: request.supervisorId },
      select: { organization: { select: { name: true } } },
    }),
  ])

  // In-app notification — respects UserProfile.notifyInApp.
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: request.supervisorId },
      select: { notifyInApp: true },
    })
    if (profile?.notifyInApp ?? true) {
      const where = request.destinationCity ? `${request.destinationCity}, ${request.destinationCountry}` : request.destinationCountry
      const amountStr = `${request.currency} ${request.totalAmount.toString()}`
      await prisma.notification.create({
        data: {
          userId: request.supervisorId,
          type: "PER_DIEM_SUBMITTED",
          message: `New per diem from ${employee?.name ?? "an employee"}: ${where}, ${request.totalDays} day${request.totalDays === 1 ? "" : "s"}, ${amountStr}`,
          channel: "IN_APP",
        },
      })
    }
  } catch (err) {
    console.warn("[per-diem] in-app notify failed", err)
  }

  // Email — minimal inline HTML; we reuse the global Resend wrapper if
  // configured. Failures are best-effort.
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === "placeholder") return
  if (!supervisor?.email) return
  try {
    const { Resend } = await import("resend")
    const resend = new Resend(apiKey)
    const where = request.destinationCity ? `${request.destinationCity}, ${request.destinationCountry}` : request.destinationCountry
    const portal = `${process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"}/approver/per-diem`
    const totalLine = request.currency === "USD"
      ? `USD ${request.totalAmount.toString()}`
      : `${request.currency} ${request.totalAmount.toString()} (≈ USD ${request.totalAmountUSD.toString()})`
    await resend.emails.send({
      from: process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>",
      to: supervisor.email,
      replyTo: employee?.email ?? undefined,
      subject: `[Action Required] Per diem from ${employee?.name ?? "employee"} — ${where}`,
      html: `<p>${employee?.name ?? "An employee"} has submitted a per diem claim:</p>
<ul>
  <li><strong>Destination:</strong> ${where}</li>
  <li><strong>Dates:</strong> ${request.startDate.toISOString().slice(0, 10)} → ${request.endDate.toISOString().slice(0, 10)} (${request.totalDays} days)</li>
  <li><strong>Total:</strong> ${totalLine}</li>
</ul>
<p><a href="${portal}">Review in the portal →</a></p>
<p style="font-size:12px;color:#666">${organization?.organization?.name ?? "FLUX.AI"} HRMS</p>`,
    })
  } catch (err) {
    console.warn("[per-diem] email send failed", err)
  }
}
