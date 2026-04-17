import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSubmissionMonth } from "@/lib/submission-month"
import { convertToIDR } from "@/lib/fx-rates"
import { Category } from "@/generated/prisma"
import { getConfig } from "@/lib/config"

export async function GET(
  _req: NextRequest,
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
      employee: { select: { id: true, name: true, email: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
      changeRequests: {
        include: { raisedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
      auditLogs: {
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Employees can only see their own requests
  if (session.user.role === "EMPLOYEE" && request.employeeId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(request)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({ where: { id } })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (request.employeeId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (request.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT requests can be updated" }, { status: 400 })
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
    status: newStatus,
  } = body

  const updateData: Record<string, unknown> = {}
  if (title !== undefined) updateData.title = title
  if (description !== undefined) updateData.description = description
  if (amount !== undefined) updateData.amount = amount
  if (currency !== undefined) updateData.currency = currency
  if (category !== undefined) updateData.category = category
  if (receiptUrl !== undefined) updateData.receiptUrl = receiptUrl
  if (receiptRaw !== undefined) updateData.receiptRaw = receiptRaw
  if (parsedData !== undefined) updateData.parsedData = parsedData

  // Month is always based on current date + deadline cutoff, not receipt date
  // Recalculate on every save to ensure it stays in the correct folder
  updateData.month = await getSubmissionMonth()

  // Recalculate IDR conversion when amount or currency changes
  {
    const finalAmount = amount ?? Number(request.amount)
    const finalCurrency = currency ?? request.currency
    const { amountIDR, exchangeRate: fxRate } = await convertToIDR(finalAmount, finalCurrency)
    updateData.amountIDR = amountIDR
    updateData.exchangeRate = fxRate
  }

  // Handle DRAFT -> SUBMITTED transition
  if (newStatus === "SUBMITTED") {
    // Use latest values (from body or existing request)
    const finalTitle = title ?? request.title
    const finalAmount = amount ?? Number(request.amount)
    const finalCurrency = currency ?? request.currency
    const finalCategory = category ?? request.category
    const finalReceiptUrl = receiptUrl ?? request.receiptUrl

    if (!finalTitle || finalAmount == null || !finalCurrency || !finalCategory) {
      return NextResponse.json({ error: "Missing required fields for submission" }, { status: 400 })
    }

    if (!Object.values(Category).includes(finalCategory as Category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 })
    }

    // Load admin config for validation
    const configs = await prisma.adminConfig.findMany()
    const configMap: Record<string, unknown> = {}
    for (const c of configs) {
      configMap[c.key] = c.value
    }

    const submissionDeadlineConfig = configMap.submissionDeadline as { day?: number } | null
    const submissionDeadline = submissionDeadlineConfig?.day ?? null
    const allowedCategoriesConfig = configMap.allowedCategories as { categories?: string[] } | null
    const allowedCategories = allowedCategoriesConfig?.categories ?? Object.values(Category)
    const maxAmountPerCategory = (configMap.maxAmountPerCategory as Record<string, number>) ?? {}
    const requireReceiptAboveConfig = configMap.requireReceiptAbove as { amount?: number } | null
    const requireReceiptAbove = requireReceiptAboveConfig?.amount ?? null

    const today = new Date()
    const errors: string[] = []

    // Validate category allowed
    if (!allowedCategories.includes(finalCategory)) {
      errors.push(`Category "${finalCategory}" is not allowed.`)
    }

    // Validate amount <= max for category
    if (maxAmountPerCategory[finalCategory] != null && Number(finalAmount) > maxAmountPerCategory[finalCategory]) {
      errors.push(
        `Amount ${finalAmount} exceeds maximum of ${maxAmountPerCategory[finalCategory]} for category "${finalCategory}".`
      )
    }

    // Validate receipt required
    if (requireReceiptAbove != null && Number(finalAmount) > requireReceiptAbove && !finalReceiptUrl) {
      errors.push(`A receipt is required for amounts above ${requireReceiptAbove}.`)
    }

    // Validate submission deadline
    if (submissionDeadline != null && today.getDate() > submissionDeadline) {
      errors.push(`Submission deadline (day ${submissionDeadline} of the month) has passed.`)
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
    }

    // Set submission fields
    updateData.status = "SUBMITTED"
    updateData.submittedAt = new Date()

    // Month already set above via getSubmissionMonth()
  }

  const updated = await prisma.reimbursementRequest.update({
    where: { id },
    data: updateData as Parameters<typeof prisma.reimbursementRequest.update>[0]["data"],
  })

  // Write audit log
  if (newStatus === "SUBMITTED") {
    await writeAuditLog(prisma, {
      requestId: id,
      actorId: session.user.id,
      action: "REQUEST_SUBMITTED",
      details: { previousStatus: "DRAFT", updatedFields: Object.keys(updateData) },
    })

    // Create approval steps
    const committeeValue = (await getConfig(prisma, "approvalCommittee", session.user.organizationId)) as {
      mode?: string
      members?: Array<{ userId: string; order: number }>
    } | null
    const members = committeeValue?.members ?? []

    if (members.length > 0) {
      const approverIds = members.map((m) => m.userId)
      const approvers = await prisma.user.findMany({
        where: { id: { in: approverIds } },
      })

      const stepData = members
        .sort((a, b) => a.order - b.order)
        .map((member) => {
          const approver = approvers.find((a) => a.id === member.userId)
          if (!approver) return null
          return {
            requestId: id,
            approverId: member.userId,
            order: member.order,
          }
        })
        .filter(Boolean) as { requestId: string; approverId: string; order: number }[]

      if (stepData.length > 0) {
        await prisma.approvalStep.createMany({ data: stepData })
      }
    }
  } else {
    await writeAuditLog(prisma, {
      requestId: id,
      actorId: session.user.id,
      action: "REQUEST_UPDATED",
      details: { updatedFields: Object.keys(updateData) },
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({ where: { id } })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (request.employeeId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (request.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT requests can be deleted" }, { status: 400 })
  }

  await prisma.reimbursementRequest.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
