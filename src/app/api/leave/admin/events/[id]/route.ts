import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"

const Patch = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  allDay: z.boolean().optional(),
  category: z.enum(["COMPANY", "SPECIAL", "TRAINING", "OTHER"]).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  location: z.string().max(200).nullable().optional(),
})

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

async function authoriseScoped(id: string) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) return { ok: false as const, status: 403 }
  const evt = await prisma.companyEvent.findUnique({ where: { id } })
  if (!evt) return { ok: false as const, status: 404 }
  if (session.user.role === "ADMIN" && evt.organizationId !== session.user.organizationId) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const, evt }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const a = await authoriseScoped(id)
  if (!a.ok) return NextResponse.json({ error: a.status === 404 ? "Not found" : "Forbidden" }, { status: a.status })

  const parsed = Patch.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.startDate) data.startDate = utcDateOnly(parsed.data.startDate)
  if (parsed.data.endDate) data.endDate = utcDateOnly(parsed.data.endDate)

  const updated = await prisma.companyEvent.update({ where: { id }, data })
  return NextResponse.json({ event: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const a = await authoriseScoped(id)
  if (!a.ok) return NextResponse.json({ error: a.status === 404 ? "Not found" : "Forbidden" }, { status: a.status })
  await prisma.companyEvent.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
