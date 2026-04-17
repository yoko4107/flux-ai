import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import { getConfig, getAllConfigs } from "@/lib/config"
import { convertToIDR } from "@/lib/fx-rates"
import { Category } from "@/generated/prisma"
import { Prisma } from "@/generated/prisma"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      approvalSteps: { orderBy: { order: "asc" } },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  // Must be the employee who owns this request
  if (request.employeeId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (request.status !== "CHANGE_REQUESTED") {
    return NextResponse.json({ error: "Request is not in CHANGE_REQUESTED status" }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const {
    title,
    description,
    amount,
    currency,
    category,
    receiptUrl,
    parsedData,
    resolveChangeRequestId,
  } = body

  if (!resolveChangeRequestId) {
    return NextResponse.json({ error: "resolveChangeRequestId is required" }, { status: 400 })
  }

  // Resolve the change request
  await prisma.changeRequest.update({
    where: { id: resolveChangeRequestId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  })

  // Build update data for the request
  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (amount !== undefined) updateData.amount = amount
  if (currency !== undefined) updateData.currency = currency
  if (category !== undefined) updateData.category = category
  if (receiptUrl !== undefined) updateData.receiptUrl = receiptUrl
  if (parsedData !== undefined) updateData.parsedData = parsedData ?? Prisma.JsonNull

  // Re-run policy validation
  const configMap = await getAllConfigs(prisma)
  const finalAmount = amount !== undefined ? Number(amount) : Number(request.amount)
  const finalCategory = category !== undefined ? category : request.category
  const finalReceiptUrl = receiptUrl !== undefined ? receiptUrl : request.receiptUrl

  const allowedCategoriesConfig = configMap.allowedCategories as { categories?: string[] } | null
  const allowedCategories = allowedCategoriesConfig?.categories ?? Object.values(Category)
  const maxAmountPerCategory = (configMap.maxAmountPerCategory as Record<string, number>) ?? {}
  const requireReceiptAboveConfig = configMap.requireReceiptAbove as { amount?: number } | null
  const requireReceiptAbove = requireReceiptAboveConfig?.amount ?? null
  const submissionDeadlineConfig = configMap.submissionDeadline as { day?: number } | null
  const submissionDeadline = submissionDeadlineConfig?.day ?? null

  const errors: string[] = []
  const today = new Date()

  if (!allowedCategories.includes(finalCategory)) {
    errors.push(`Category "${finalCategory}" is not allowed.`)
  }
  if (maxAmountPerCategory[finalCategory] != null && finalAmount > maxAmountPerCategory[finalCategory]) {
    errors.push(`Amount ${finalAmount} exceeds maximum of ${maxAmountPerCategory[finalCategory]} for category "${finalCategory}".`)
  }
  if (requireReceiptAbove != null && finalAmount > requireReceiptAbove && !finalReceiptUrl) {
    errors.push(`A receipt is required for amounts above ${requireReceiptAbove}.`)
  }
  if (submissionDeadline != null && today.getDate() > submissionDeadline) {
    errors.push(`Submission deadline (day ${submissionDeadline} of the month) has passed.`)
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
  }

  // Recalculate IDR conversion
  const finalAmt = amount !== undefined ? Number(amount) : Number(request.amount)
  const finalCur = currency !== undefined ? currency : request.currency
  const { amountIDR, exchangeRate: fxRate } = await convertToIDR(finalAmt, finalCur)
  updateData.amountIDR = amountIDR
  updateData.exchangeRate = fxRate

  // Determine resubmit behavior
  const resubmitBehaviorConfig = await getConfig(prisma, "resubmitBehavior") as { resetToBeginning?: boolean } | null
  const resetToBeginning = resubmitBehaviorConfig?.resetToBeginning !== false

  // Reset approval steps
  if (resetToBeginning) {
    // Reset ALL steps to PENDING
    await prisma.approvalStep.updateMany({
      where: { requestId: id },
      data: { status: "PENDING", decidedAt: null, comment: null },
    })
  } else {
    // Find the step that requested change, reset from that step forward
    const changeRequestedStep = request.approvalSteps.find(
      (s) => s.status === "CHANGE_REQUESTED"
    )
    if (changeRequestedStep) {
      await prisma.approvalStep.updateMany({
        where: {
          requestId: id,
          order: { gte: changeRequestedStep.order },
        },
        data: { status: "PENDING", decidedAt: null, comment: null },
      })
    } else {
      // Fallback: reset all
      await prisma.approvalStep.updateMany({
        where: { requestId: id },
        data: { status: "PENDING", decidedAt: null, comment: null },
      })
    }
  }

  // Update the request
  const updated = await prisma.reimbursementRequest.update({
    where: { id },
    data: {
      ...updateData as Parameters<typeof prisma.reimbursementRequest.update>[0]["data"],
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
      changeRequests: { orderBy: { createdAt: "asc" } },
    },
  })

  // Notify approvers
  const pendingSteps = await prisma.approvalStep.findMany({
    where: { requestId: id, status: "PENDING" },
  })

  for (const step of pendingSteps) {
    await sendNotification({
      userId: step.approverId,
      requestId: id,
      type: "REQUEST_RESUBMITTED",
      message: `Request "${updated.title}" has been resubmitted after changes.`,
    })
  }

  await writeAuditLog(prisma, {
    requestId: id,
    actorId: session.user.id,
    action: "REQUEST_RESUBMITTED",
    details: { resolveChangeRequestId, updatedFields: Object.keys(updateData) },
  })

  return NextResponse.json(updated)
}
