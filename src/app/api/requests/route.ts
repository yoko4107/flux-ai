import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSubmissionMonth } from "@/lib/submission-month"
import { convert } from "@/lib/fx-rates"
import { getReimbursementCurrencyForUser } from "@/lib/org-currency"
import { Category, RequestStatus } from "@/generated/prisma"
import { resolveCommittee, buildApprovalSteps, selectNotifyTargets } from "@/lib/approval-routing-helpers"
import { sendNotification } from "@/lib/notifications"
import { getConfig } from "@/lib/config"
import { validateSubmission, shouldAutoApprove } from "@/lib/submission-limits"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")
  const status = searchParams.get("status")

  const where: Record<string, unknown> = { employeeId: session.user.id }
  if (month) where.month = month
  if (status) where.status = status as RequestStatus

  const requests = await prisma.reimbursementRequest.findMany({
    where,
    include: { employee: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(requests)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const {
    title,
    description,
    amount,
    currency,
    category,
    receiptUrl,
    receiptRaw,
    parsedData,
    status,
    month: monthInput,
  } = body

  if (!title || amount == null || !currency || !category || !status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (!Object.values(Category).includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 })
  }

  if (!["DRAFT", "SUBMITTED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  // Derive month — always based on current date + deadline cutoff, never receipt date
  const month = monthInput || await getSubmissionMonth()

  // Resolve submitter's CC and org scope (needed for CC-scoped config lookups)
  const submitter = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { costCenterId: true, organizationId: true },
  })
  const submitterCCId = submitter?.costCenterId ?? null
  const orgId = submitter?.organizationId ?? session.user.organizationId ?? null

  let submissionDeadline: number | null = null
  let allowedCategories: string[] = Object.values(Category)
  let maxAmountPerCategory: Record<string, number> = {}
  let requireReceiptAbove: number | null = null
  let maxAmountPerRequest: number | null = null
  let approvalThreshold: number | null = null

  if (status === "SUBMITTED") {
    // Load CC-scoped config (replaces broken bare findMany() that had no CC/org scope)
    const [submissionDeadlineRaw, allowedCategoriesRaw, maxAmtPerCatRaw,
           requireReceiptRaw, maxAmtPerReqRaw, approvalThreshRaw] =
      await Promise.all([
        getConfig(prisma, "submissionDeadline", orgId, submitterCCId),
        getConfig(prisma, "allowedCategories", orgId, submitterCCId),
        getConfig(prisma, "maxAmountPerCategory", orgId, submitterCCId),
        getConfig(prisma, "requireReceiptAbove", orgId, submitterCCId),
        getConfig(prisma, "maxAmountPerRequest", orgId, submitterCCId),
        getConfig(prisma, "approvalThreshold", orgId, submitterCCId),
      ])

    // Shape fix: all stored as bare numbers, NOT as { day: number } objects
    submissionDeadline = typeof submissionDeadlineRaw === "number" ? submissionDeadlineRaw : null
    allowedCategories = Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw as string[] : Object.values(Category)
    maxAmountPerCategory = (maxAmtPerCatRaw as Record<string, number>) ?? {}
    requireReceiptAbove = typeof requireReceiptRaw === "number" ? requireReceiptRaw : null
    maxAmountPerRequest = typeof maxAmtPerReqRaw === "number" ? maxAmtPerReqRaw : null
    approvalThreshold = typeof approvalThreshRaw === "number" ? approvalThreshRaw : null

    const errors = validateSubmission(Number(amount), category, receiptUrl ?? null, {
      maxAmountPerRequest,
      maxAmountPerCategory,
      approvalThreshold,
      submissionDeadline,
      allowedCategories,
      requireReceiptAbove,
    })
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
    }
  }

  const createData: Record<string, unknown> = {
    employeeId: session.user.id,
    title,
    description: description ?? null,
    amount,
    currency,
    category,
    receiptUrl: receiptUrl ?? null,
    receiptRaw: receiptRaw ?? null,
    parsedData: parsedData ?? null,
    status,
    month,
  }

  // Convert to the employee's *reimbursement* currency — driven by their
  // cost center first, falling back to the org's base currency. The legacy
  // amountIDR column now holds the amount in this resolved target currency.
  const { currency: targetCurrency } = await getReimbursementCurrencyForUser(session.user.id)
  const { amountBase, exchangeRate } = await convert(Number(amount), currency, targetCurrency)
  createData.amountIDR = amountBase
  createData.exchangeRate = exchangeRate

  if (status === "SUBMITTED") {
    createData.submittedAt = new Date()
  }

  let request
  try {
    request = await prisma.reimbursementRequest.create({ data: createData as Parameters<typeof prisma.reimbursementRequest.create>[0]["data"] })
  } catch (dbErr) {
    console.error("DB create error:", dbErr)
    return NextResponse.json({ error: "Failed to create request", details: [String(dbErr)] }, { status: 500 })
  }

  // Write audit log
  await writeAuditLog(prisma, {
    requestId: request.id,
    actorId: session.user.id,
    action: "REQUEST_CREATED",
    details: { status, amount: Number(amount), category },
  })

  // Auto-approve: skip approval steps entirely if amount is within threshold
  if (status === "SUBMITTED" && shouldAutoApprove(Number(amount), approvalThreshold)) {
    await prisma.reimbursementRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", updatedAt: new Date() },
    })
    await writeAuditLog(prisma, {
      requestId: request.id,
      actorId: session.user.id,
      action: "REQUEST_APPROVED",
      details: { reason: "auto-approved: amount below approvalThreshold", amount: Number(amount) },
    })
    return NextResponse.json({ ...request, status: "APPROVED" }, { status: 201 })
  }

  // Create approval steps if submitted
  if (status === "SUBMITTED") {
    const committeeValue = await resolveCommittee(
      prisma,
      session.user.organizationId,
      submitterCCId,
    )

    const rawApprovers = committeeValue?.approvers ?? []
    const mode = committeeValue?.mode ?? "sequential"
    const stepData = buildApprovalSteps(request.id, rawApprovers)

    if (stepData.length > 0) {
      await prisma.approvalStep.createMany({ data: stepData })
      const notifyTargets = selectNotifyTargets(mode, stepData)
      for (const approverId of notifyTargets) {
        await sendNotification({
          userId: approverId,
          requestId: request.id,
          type: "APPROVAL_REQUESTED",
          message: `You have a new reimbursement request pending approval: ${title}`,
        })
      }
    }
  }

  return NextResponse.json(request, { status: 201 })
}
