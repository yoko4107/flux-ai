import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOvertimePolicy, POLICY_CONFIG_KEY } from "@/lib/leave-policy"

// GET  /api/leave/admin/policy   — return effective + stored OT policy
// PUT  /api/leave/admin/policy   — admin upserts the org-specific override
//
// Stored as an AdminConfig row keyed by the org id.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const effective = await getOvertimePolicy(session.user.organizationId)
  const stored = await prisma.adminConfig.findFirst({
    where: { key: POLICY_CONFIG_KEY, organizationId: session.user.organizationId },
  })
  return NextResponse.json({
    effective,
    isOverride: !!stored,
    storedAt: stored?.updatedAt ?? null,
  })
}

const Body = z.object({
  weekday: z.number().min(1).max(5),
  weekend: z.number().min(1).max(5),
  publicHoliday: z.number().min(1).max(5),
  lieuExpiryMonths: z.number().int().min(1).max(36),
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
    where: { key_organizationId: { key: POLICY_CONFIG_KEY, organizationId: session.user.organizationId } },
    update: { value: parsed.data, updatedById: session.user.id },
    create: { key: POLICY_CONFIG_KEY, organizationId: session.user.organizationId, value: parsed.data, updatedById: session.user.id },
  })
  return NextResponse.json({ ok: true, policy: parsed.data })
}

export async function DELETE() {
  // Reset to country defaults by removing the override.
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })
  await prisma.adminConfig.deleteMany({
    where: { key: POLICY_CONFIG_KEY, organizationId: session.user.organizationId },
  })
  return NextResponse.json({ ok: true })
}
