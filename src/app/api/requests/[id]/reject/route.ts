import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = session.user.role
  if (role !== "APPROVER" && role !== "FINANCE" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { comment } = body

  if (!comment || typeof comment !== "string" || !comment.trim()) {
    return NextResponse.json({ error: "A comment/reason is required when rejecting" }, { status: 400 })
  }

  // Find the PENDING ApprovalStep for this request/approver
  const step = await prisma.approvalStep.findFirst({
    where: { requestId: id, approverId: session.user.id, status: "PENDING" },
  })

  if (!step) {
    return NextResponse.json({ error: "No pending approval step found for you on this request" }, { status: 403 })
  }

  // Update step to REJECTED
  await prisma.approvalStep.update({
    where: { id: step.id },
    data: { status: "REJECTED", decidedAt: new Date(), comment },
  })

  // Set request to REJECTED
  await prisma.reimbursementRequest.update({
    where: { id },
    data: { status: "REJECTED" },
  })

  const request = await prisma.reimbursementRequest.findUnique({ where: { id } })

  if (request) {
    await sendNotification({
      userId: request.employeeId,
      requestId: id,
      type: "REQUEST_REJECTED",
      message: `Your request "${request.title}" has been rejected. Reason: ${comment}`,
    })
  }

  await writeAuditLog(prisma, {
    requestId: id,
    actorId: session.user.id,
    action: "STEP_REJECTED",
    details: { stepId: step.id, approverId: session.user.id, comment },
  })

  const updated = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
      changeRequests: { orderBy: { createdAt: "asc" } },
    },
  })

  return NextResponse.json(updated)
}
