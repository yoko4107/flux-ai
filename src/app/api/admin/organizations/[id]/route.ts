import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only Super Admin can modify organizations" }, { status: 403 })
  }

  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })

  const org = await prisma.organization.update({
    where: { id },
    data: parsed.data,
    include: { _count: { select: { users: true } } },
  })
  return NextResponse.json(org)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only Super Admin can modify organizations" }, { status: 403 })
  }

  const { id } = await params
  await prisma.user.updateMany({ where: { organizationId: id }, data: { organizationId: null } })
  await prisma.organization.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
