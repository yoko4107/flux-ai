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

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { message } = body

  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "A message is required" }, { status: 400 })
  }

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      approvalSteps: { where: { approverId: session.user.id, status: "PENDING" } },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  const raisedByRole = session.user.role

  // Create the ChangeRequest
  const changeRequest = await prisma.changeRequest.create({
    data: {
      requestId: id,
      raisedById: session.user.id,
      raisedByRole,
      message,
      status: "OPEN",
    },
  })

  // If approver: update their step to CHANGE_REQUESTED
  if (raisedByRole === "APPROVER" || raisedByRole === "FINANCE" || raisedByRole === "ADMIN") {
    const step = request.approvalSteps[0]
    if (step) {
      await prisma.approvalStep.update({
        where: { id: step.id },
        data: { status: "CHANGE_REQUESTED" },
      })
    }
  }

  // Set request status to CHANGE_REQUESTED
  await prisma.reimbursementRequest.update({
    where: { id },
    data: { status: "CHANGE_REQUESTED" },
  })

  // Notify the other party
  if (raisedByRole === "EMPLOYEE") {
    // Employee responded — notify all active approvers
    const activeSteps = await prisma.approvalStep.findMany({
      where: { requestId: id, status: { in: ["PENDING", "CHANGE_REQUESTED"] } },
    })
    for (const step of activeSteps) {
      await sendNotification({
        userId: step.approverId,
        requestId: id,
        type: "EMPLOYEE_RESPONDED",
        message: `Employee has responded to change request on "${request.title}".`,
      })
    }
  } else {
    // Approver requested change — notify employee
    await sendNotification({
      userId: request.employeeId,
      requestId: id,
      type: "CHANGE_REQUESTED",
      message: `Changes requested on your submission "${request.title}": ${message}`,
    })
  }

  await writeAuditLog(prisma, {
    requestId: id,
    actorId: session.user.id,
    action: "CHANGE_REQUESTED",
    details: { changeRequestId: changeRequest.id, raisedByRole, message },
  })

  return NextResponse.json(changeRequest)
}
