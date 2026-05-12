import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET  /api/admin/cost-centers           — list CCs in caller's org
// POST /api/admin/cost-centers           — create a CC
//
// Admin-only. Super-admin can pass ?orgId=… to scope to another org.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

function resolveOrgId(
  req: NextRequest,
  user: { role: string; organizationId: string | null }
): string | null {
  const param = new URL(req.url).searchParams.get("orgId")
  if (user.role === "SUPER_ADMIN" && param) return param
  return user.organizationId ?? null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const orgId = resolveOrgId(req, {
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  })
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const costCenters = await prisma.costCenter.findMany({
    where: { organizationId: orgId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { users: true } },
    },
  })
  return NextResponse.json({ costCenters })
}

const Body = z.object({
  code: z.string().min(1).max(32).regex(/^[A-Z0-9_-]+$/, "Use A–Z, 0–9, -, _"),
  name: z.string().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "ISO-3166-1 alpha-2"),
  currency: z.string().regex(/^[A-Z]{3}$/, "ISO-4217"),
  active: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const orgId = resolveOrgId(req, {
    role: session.user.role,
    organizationId: session.user.organizationId ?? null,
  })
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  try {
    const created = await prisma.costCenter.create({
      data: {
        organizationId: orgId,
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        countryCode: parsed.data.countryCode,
        currency: parsed.data.currency,
        active: parsed.data.active,
      },
    })
    return NextResponse.json({ costCenter: created }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Create failed"
    // Most likely P2002 — unique constraint on (organizationId, code)
    if (msg.includes("Unique") || msg.includes("P2002")) {
      return NextResponse.json({ error: `Code "${parsed.data.code}" is already used in this org.` }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
