import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { z } from "zod"

const patchUserSchema = z.object({
  name: z.string().nullable().optional(),
  role: z.enum(["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN", "SUPER_ADMIN"] as const).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"] as const).optional(),
  department: z.string().nullable().optional(),
  hireDate: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),
  // HR profile fields — stored on UserProfile (upserted if missing)
  jobTitle: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employmentStartDate: z.string().nullable().optional(), // ISO date string
  employmentEndDate: z.string().nullable().optional(),   // ISO date string
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

  const { name, role, status, department, hireDate, managerId, organizationId, costCenterId,
          jobTitle, phone, employmentStartDate, employmentEndDate } = parsed.data

  // If the caller is trying to assign a cost center, make sure it belongs
  // to the target user's org (or the caller's org for non-super-admins).
  if (costCenterId) {
    const cc = await prisma.costCenter.findUnique({ where: { id: costCenterId } })
    if (!cc) {
      return NextResponse.json({ error: "Cost center not found" }, { status: 400 })
    }
    const targetOrgId = organizationId ?? existing.organizationId
    if (cc.organizationId !== targetOrgId) {
      return NextResponse.json({ error: "Cost center belongs to a different organization" }, { status: 400 })
    }
  }

  // Build profile patch if any HR fields were sent
  const hasProfileUpdate = jobTitle !== undefined || phone !== undefined ||
    employmentStartDate !== undefined || employmentEndDate !== undefined
  const profileData = hasProfileUpdate ? {
    ...(jobTitle !== undefined ? { jobTitle } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(employmentStartDate !== undefined
      ? { employmentStartDate: employmentStartDate ? new Date(employmentStartDate) : null }
      : {}),
    ...(employmentEndDate !== undefined
      ? { employmentEndDate: employmentEndDate ? new Date(employmentEndDate) : null }
      : {}),
  } : undefined

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(department !== undefined ? { department } : {}),
      ...(hireDate !== undefined ? { hireDate: hireDate ? new Date(hireDate) : null } : {}),
      ...(managerId !== undefined ? { managerId } : {}),
      ...(organizationId !== undefined ? { organizationId } : {}),
      ...(costCenterId !== undefined ? { costCenterId } : {}),
      ...(profileData ? {
        profile: { upsert: { create: profileData, update: profileData } },
      } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      department: true,
      hireDate: true,
      driveFolderId: true,
      managerId: true,
      organizationId: true,
      costCenterId: true,
      createdAt: true,
      manager: { select: { name: true } },
      organization: { select: { id: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true, currency: true, countryCode: true } },
      profile: { select: { jobTitle: true, employmentStartDate: true, employmentEndDate: true, phone: true } },
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

export async function DELETE(
  _request: Request,
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
  const targetUser = await prisma.user.findUnique({ where: { id } })
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }
  if (!isSuperAdmin && targetUser.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (targetUser.id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })

  await writeAuditLog(prisma, {
    actorId: session.user.id,
    action: "USER_UPDATED",
    details: { userId: id, action: "deleted", email: targetUser.email },
  })

  return NextResponse.json({ success: true })
}
