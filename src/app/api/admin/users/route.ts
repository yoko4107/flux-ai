import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { z } from "zod"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const roleFilter = searchParams.get("role")
  const orgFilter = searchParams.get("orgId")

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const orgScope = !isSuperAdmin && session.user.organizationId
    ? { organizationId: session.user.organizationId }
    : {}

  const users = await prisma.user.findMany({
    where: {
      ...orgScope,
      ...(roleFilter ? { role: roleFilter as never } : {}),
      ...(orgFilter ? { organizationId: orgFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      managerId: true,
      organizationId: true,
      createdAt: true,
      manager: { select: { name: true } },
      organization: { select: { id: true, name: true } },
      _count: { select: { requests: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(users)
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN", "SUPER_ADMIN"] as const),
  department: z.string().optional(),
  managerId: z.string().optional(),
  organizationId: z.string().optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })

  const { name, email, role, department, managerId, organizationId } = parsed.data

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const orgId = isSuperAdmin
    ? (organizationId ?? null)
    : (session.user.organizationId ?? null)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 })

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      department: department ?? null,
      managerId: managerId ?? null,
      organizationId: orgId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      managerId: true,
      organizationId: true,
      createdAt: true,
      manager: { select: { name: true } },
      organization: { select: { id: true, name: true } },
      _count: { select: { requests: true } },
    },
  })

  await writeAuditLog(prisma, {
    actorId: session.user.id,
    action: "USER_CREATED",
    details: { userId: user.id, name, email, role },
  })

  return NextResponse.json(user, { status: 201 })
}
