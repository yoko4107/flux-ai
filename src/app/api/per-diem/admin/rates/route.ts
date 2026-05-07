import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PER_DIEM_RATES_KEY, getRateTable } from "@/lib/per-diem"

// GET    /api/per-diem/admin/rates  — effective rates + override status.
// PUT    /api/per-diem/admin/rates  — upsert the org-specific override.
// DELETE /api/per-diem/admin/rates  — remove the override (revert to defaults).

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  const rates = await getRateTable(session.user.organizationId)
  const stored = await prisma.adminConfig.findFirst({
    where: { key: PER_DIEM_RATES_KEY, organizationId: session.user.organizationId },
  })
  return NextResponse.json({
    rates,
    isOverride: !!stored,
    storedAt: stored?.updatedAt ?? null,
  })
}

const CountryRate = z.object({
  standard: z.number().min(0).max(2000),
  highCost: z.number().min(0).max(2000).optional(),
  highCostCities: z.array(z.string().max(60)).max(40).optional(),
})

// Body: { rates: { VN: { standard: 70 }, SA: { standard: 115, highCost: 140, highCostCities: [...] } } }
const Body = z.object({
  rates: z.record(z.string().regex(/^[A-Z]{2}$/), CountryRate),
})

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  await prisma.adminConfig.upsert({
    where: { key_organizationId: { key: PER_DIEM_RATES_KEY, organizationId: session.user.organizationId } },
    update: { value: parsed.data.rates, updatedById: session.user.id },
    create: { key: PER_DIEM_RATES_KEY, organizationId: session.user.organizationId, value: parsed.data.rates, updatedById: session.user.id },
  })
  return NextResponse.json({ ok: true, rates: parsed.data.rates })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  await prisma.adminConfig.deleteMany({
    where: { key: PER_DIEM_RATES_KEY, organizationId: session.user.organizationId },
  })
  return NextResponse.json({ ok: true })
}
