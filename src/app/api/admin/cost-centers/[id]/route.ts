import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH  /api/admin/cost-centers/[id]    — update (name / currency / active / countryCode)
// DELETE /api/admin/cost-centers/[id]    — delete; users assigned to it
//                                          fall through to org base currency
//                                          (the FK is ON DELETE SET NULL).
// Admin-only, scoped to caller's org.

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

async function loadAndAuthorize(id: string) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return { error: "Forbidden" as const, status: 403 as const }
  }
  const cc = await prisma.costCenter.findUnique({ where: { id } })
  if (!cc) return { error: "Not found" as const, status: 404 as const }
  if (session.user.role === "ADMIN" && cc.organizationId !== session.user.organizationId) {
    return { error: "Forbidden" as const, status: 403 as const }
  }
  return { costCenter: cc }
}

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await loadAndAuthorize(id)
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status })

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.costCenter.update({
    where: { id },
    data: parsed.data,
  })
  return NextResponse.json({ costCenter: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth_ = await loadAndAuthorize(id)
  if ("error" in auth_) return NextResponse.json({ error: auth_.error }, { status: auth_.status })

  await prisma.costCenter.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
