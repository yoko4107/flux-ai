import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Fetch the request to check ownership
  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    select: { employeeId: true },
  })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const userRole = session.user.role
  const userId = session.user.id

  // Check authorization: owner, approver with steps on this request, finance, or admin
  if (userRole === "EMPLOYEE" && request.employeeId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (userRole === "APPROVER") {
    const hasStep = await prisma.approvalStep.findFirst({
      where: { requestId: id, approverId: userId },
    })
    if (!hasStep) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  // FINANCE and ADMIN always have access

  const auditLogs = await prisma.auditLog.findMany({
    where: { requestId: id },
    include: {
      actor: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const result = auditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    details: log.details,
    actor: {
      name: log.actor.name ?? "Unknown",
      role: log.actor.role,
    },
    createdAt: log.createdAt,
  }))

  return NextResponse.json(result)
}
