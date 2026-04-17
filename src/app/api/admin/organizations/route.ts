import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const orgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  industry: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const orgs = await prisma.organization.findMany({
    where: isSuperAdmin ? {} : { id: session.user.organizationId ?? "" },
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(orgs)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only Super Admin can create organizations" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = orgSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })

  const existing = await prisma.organization.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) return NextResponse.json({ error: "Slug already in use" }, { status: 409 })

  const org = await prisma.organization.create({
    data: parsed.data,
    include: { _count: { select: { users: true } } },
  })
  return NextResponse.json(org, { status: 201 })
}
