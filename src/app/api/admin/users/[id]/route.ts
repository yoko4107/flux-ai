import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { z } from "zod"

const patchUserSchema = z.object({
  role: z.enum(["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN", "SUPER_ADMIN"] as const).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"] as const).optional(),
  department: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  if (!isSuperAdmin) {
    const targetUser = await prisma.user.findUnique({ where: { id } })
    if (!targetUser || targetUser.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = patchUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { role, status, department, managerId, organizationId } = parsed.data

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(department !== undefined ? { department } : {}),
      ...(managerId !== undefined ? { managerId } : {}),
      ...(organizationId !== undefined ? { organizationId } : {}),
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
    action: "USER_UPDATED",
    details: {
      userId: id,
      changes: parsed.data,
      oldRole: existing.role,
      oldDepartment: existing.department,
      oldManagerId: existing.managerId,
    },
  })

  return NextResponse.json(user)
}
