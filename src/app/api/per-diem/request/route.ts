import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
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
  // Legacy field — still accepted for back-compat, but the modern flow
  // computes the total from `items` instead and skips creating PerDiemDay
  // rows entirely.
  days: z.array(DayInput).optional(),
  // Optional foreign-currency / international wire transfer override.
  // When the employee fills these in, finance pays them via wire to the
  // named account in the named currency instead of the org's default flow.
  payoutCurrency:      z.string().regex(/^[A-Z]{3}$/).optional(),
  payoutAccountHolder: z.string().max(120).optional(),
  payoutAccountNumber: z.string().max(60).optional(),
  payoutBankName:      z.string().max(120).optional(),
  payoutBankAddress:   z.string().max(300).optional(),
  payoutSwiftCode:     z.string().max(20).optional(),
  payoutRoutingNumber: z.string().max(40).optional(),
  payoutNotes:         z.string().max(1000).optional(),
  // High-level category for the trip — gives approvers a quick read on
  // what kind of expense this is. Free-form code; UI suggests common values.
  category: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/).optional(),
  // Itemized breakdown — required, drives the request total. Each item
  // carries a category + free-text description and a required amount in
  // the chosen currency. Optional date links the item to a specific day
  // inside the trip range.
  items: z.array(z.object({
    category: z.enum(["MEALS", "LODGING", "TRANSPORT", "INCIDENTAL", "COMMUNICATION", "OTHER"]).default("OTHER"),
    description: z.string().min(1).max(500),
    amount: z.number().min(0).max(100_000_000),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).min(1, "At least one item is required").max(50),
})

const MAX_TRIP_DAYS = 90

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }
  const { destinationCountry, destinationCity, startDate, endDate, reason } = parsed.data
  const items = parsed.data.items

  const employee = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, organizationId: true, managerId: true, costCenterId: true },
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
  // Item-level dates (when supplied) must fall inside the trip range —
  // otherwise an item could be linked to a day that isn't part of the trip.
  for (const it of items) {
    if (!it.date) continue
    const d = utcDate(it.date)
    if (d < start || d > end) {
      return NextResponse.json(
        { error: `Item date ${it.date} falls outside the trip range ${startDate} → ${endDate}` },
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

  // Resolve the policy rate (informational only now — items drive the
  // total). Captures the destination's high-cost flag and the FX rate at
  // submission so the stored claim is reproducible.
  // Resolve rates against the employee's regional office — Vietnam-based
  // travelers see VN-office overrides on top of the org defaults.
  const rates = await getRateTable(employee.organizationId, employee.costCenterId)
  const { rate: baseRateUSD, isHighCost } = rateForDestination(rates, destinationCountry, destinationCity)
  if (baseRateUSD <= 0) {
    return NextResponse.json(
      { error: `No per diem rate configured for ${destinationCountry}. Ask an admin.` },
      { status: 400 }
    )
  }

  const currency = parsed.data.currency.toUpperCase()
  const conv = await convert(baseRateUSD, "USD", currency)
  // 1 USD = exchangeRate target-currency units. Frozen on the request so
  // subsequent FX moves don't retroactively alter approved claims.
  const exchangeRate = conv.exchangeRate

  // Total comes straight from items now. Round to 2 decimals to avoid
  // floating-point drift sneaking into Decimal storage.
  const totalAmount = Math.round(items.reduce((acc, it) => acc + it.amount, 0) * 100) / 100
  const totalAmountUSD = exchangeRate > 0
    ? Math.round((totalAmount / exchangeRate) * 100) / 100
    : totalAmount

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
      payoutCurrency:      parsed.data.payoutCurrency      ?? null,
      payoutAccountHolder: parsed.data.payoutAccountHolder ?? null,
      payoutAccountNumber: parsed.data.payoutAccountNumber ?? null,
      payoutBankName:      parsed.data.payoutBankName      ?? null,
      payoutBankAddress:   parsed.data.payoutBankAddress   ?? null,
      payoutSwiftCode:     parsed.data.payoutSwiftCode     ?? null,
      payoutRoutingNumber: parsed.data.payoutRoutingNumber ?? null,
      payoutNotes:         parsed.data.payoutNotes         ?? null,
      category:            parsed.data.category            ?? "BUSINESS_TRAVEL",
      // Items are required and drive the total. PerDiemDay rows are no
      // longer created — older claims may still have them, but new claims
      // are item-only.
      items: {
        createMany: {
          data: items.map((it) => ({
            category: it.category,
            description: it.description,
            amount: it.amount,
            amountUSD: exchangeRate > 0
              ? Math.round((it.amount / exchangeRate) * 100) / 100
              : null,
            date: it.date ? utcDate(it.date) : null,
          })),
        },
      },
    },
    include: {
      days: { orderBy: { date: "asc" } },
      items: { orderBy: { createdAt: "asc" } },
    },
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
      items: { orderBy: { createdAt: "asc" } },
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
