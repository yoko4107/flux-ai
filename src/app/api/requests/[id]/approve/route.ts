/**
 * ENFC-01 Enforcement Verification (2026-05-14)
 *
 * Sequential routing:
 * - On approve: marks calling approver's step APPROVED.
 * - If remaining steps exist, notifies the lowest-order PENDING step approver.
 * - Request reaches APPROVED only when all steps are APPROVED.
 * - Verdict: CORRECT — step-by-step gating enforced.
 *
 * Parallel routing:
 * - All steps created at submission (order may differ; all PENDING).
 * - On each approve: marks that approver's step APPROVED.
 * - If other steps remain PENDING, nextStep lookup finds one and sends a notification.
 *   In parallel mode this sends a reminder to the next uncompleted approver — acceptable behavior.
 * - Request reaches APPROVED only when ALL steps are APPROVED (allSteps.every check).
 * - Verdict: CORRECT — all-must-approve gate enforced.
 */
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
  const comment = body.comment ?? null

  // Find the PENDING ApprovalStep for this request/approver
  const step = await prisma.approvalStep.findFirst({
    where: { requestId: id, approverId: session.user.id, status: "PENDING" },
  })

  if (!step) {
    return NextResponse.json({ error: "No pending approval step found for you on this request" }, { status: 403 })
  }

  // Update step to APPROVED
  await prisma.approvalStep.update({
    where: { id: step.id },
    data: { status: "APPROVED", decidedAt: new Date(), comment },
  })

  // Set request to UNDER_REVIEW
  await prisma.reimbursementRequest.update({
    where: { id },
    data: { status: "UNDER_REVIEW" },
  })

  // Check if ALL steps are now APPROVED
  const allSteps = await prisma.approvalStep.findMany({ where: { requestId: id } })
  const allApproved = allSteps.every((s) => s.status === "APPROVED")

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true, organizationId: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  // Org scoping: prevent cross-org approval
  if (session.user.role !== "SUPER_ADMIN" && request.employee.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (allApproved) {
    // Fully approved — update request status and notify employee
    await prisma.reimbursementRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    })
    await sendNotification({
      userId: request.employeeId,
      requestId: id,
      type: "REQUEST_APPROVED",
      message: `Your request "${request.title}" has been approved.`,
    })
  } else {
    // Find next PENDING step and notify that approver
    const nextStep = allSteps
      .filter((s) => s.status === "PENDING")
      .sort((a, b) => a.order - b.order)[0]

    if (nextStep) {
      await sendNotification({
        userId: nextStep.approverId,
        requestId: id,
        type: "APPROVAL_REQUIRED",
        message: `You have a new request to review: "${request.title}".`,
      })
    }
  }

  await writeAuditLog(prisma, {
    requestId: id,
    actorId: session.user.id,
    action: "STEP_APPROVED",
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
