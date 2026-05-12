import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PER_DIEM_RATES_KEY, getRateTable } from "@/lib/per-diem"

// GET    /api/per-diem/admin/rates?costCenterId=<id>
//   Effective merged rate table (defaults → org-wide → CC), plus the
//   list of cost centers so the UI can offer the picker.
// PUT    /api/per-diem/admin/rates
//   Body: { rates, costCenterId? }
//   Upsert the rate override. costCenterId=null = org-wide bucket.
// DELETE /api/per-diem/admin/rates?costCenterId=<id>
//   Remove the override (revert that bucket to defaults / parent).

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

function readCostCenterParam(req: NextRequest): string | null {
  const v = new URL(req.url).searchParams.get("costCenterId")
  return v && v !== "ORG" && v !== "" ? v : null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const orgId = session.user.organizationId
  const costCenterId = readCostCenterParam(req)

  // Validate the CC, if supplied, belongs to this org.
  if (costCenterId) {
    const cc = await prisma.costCenter.findUnique({
      where: { id: costCenterId },
      select: { organizationId: true },
    })
    if (!cc || cc.organizationId !== orgId) {
      return NextResponse.json({ error: "Cost center not found in this organization" }, { status: 400 })
    }
  }

  const rates = await getRateTable(orgId, costCenterId)

  // The override row that actually exists for the requested bucket — used
  // by the UI to show "Custom override" vs "Inherited".
  const stored = await prisma.adminConfig.findFirst({
    where: { key: PER_DIEM_RATES_KEY, organizationId: orgId, costCenterId },
    select: { updatedAt: true },
  })

  const costCenters = await prisma.costCenter.findMany({
    where: { organizationId: orgId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, countryCode: true, currency: true },
  })

  return NextResponse.json({
    rates,
    isOverride: !!stored,
    storedAt: stored?.updatedAt ?? null,
    costCenters,
    scope: costCenterId,
  })
}

const CountryRate = z.object({
  standard: z.number().min(0).max(2000),
  highCost: z.number().min(0).max(2000).optional(),
  highCostCities: z.array(z.string().max(60)).max(40).optional(),
})

// Body: { rates: { VN: {...}, … }, costCenterId?: string | null }
const Body = z.object({
  rates: z.record(z.string().regex(/^[A-Z]{2}$/), CountryRate),
  costCenterId: z.string().nullable().optional(),
})

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  const orgId = session.user.organizationId

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const costCenterId = parsed.data.costCenterId ?? null
  if (costCenterId) {
    const cc = await prisma.costCenter.findUnique({
      where: { id: costCenterId },
      select: { organizationId: true },
    })
    if (!cc || cc.organizationId !== orgId) {
      return NextResponse.json({ error: "Cost center not found in this organization" }, { status: 400 })
    }
  }

  // Composite key (key, orgId, costCenterId) uses NULLS NOT DISTINCT in the
  // DB — but Prisma's named upsert helper can't express the NULL leg, so we
  // find-then-update-or-create manually.
  const existing = await prisma.adminConfig.findFirst({
    where: { key: PER_DIEM_RATES_KEY, organizationId: orgId, costCenterId },
  })
  if (existing) {
    await prisma.adminConfig.update({
      where: { id: existing.id },
      data: { value: parsed.data.rates, updatedById: session.user.id },
    })
  } else {
    await prisma.adminConfig.create({
      data: {
        key: PER_DIEM_RATES_KEY,
        organizationId: orgId,
        costCenterId,
        value: parsed.data.rates,
        updatedById: session.user.id,
      },
    })
  }

  return NextResponse.json({ ok: true, rates: parsed.data.rates, scope: costCenterId })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  const orgId = session.user.organizationId
  const costCenterId = readCostCenterParam(req)
  await prisma.adminConfig.deleteMany({
    where: { key: PER_DIEM_RATES_KEY, organizationId: orgId, costCenterId },
  })
  return NextResponse.json({ ok: true, scope: costCenterId })
}
