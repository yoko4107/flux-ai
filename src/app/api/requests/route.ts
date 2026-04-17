import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSubmissionMonth } from "@/lib/submission-month"
import { convert } from "@/lib/fx-rates"
import { getOrgBaseCurrency } from "@/lib/org-currency"
import { Category, RequestStatus } from "@/generated/prisma"
import { getConfig } from "@/lib/config"

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

  if (status === "SUBMITTED") {
    // Load admin config
    const configs = await prisma.adminConfig.findMany()
    const configMap: Record<string, unknown> = {}
    for (const c of configs) {
      configMap[c.key] = c.value
    }

    // Extract nested config values (stored as JSON objects)
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
    if (!allowedCategories.includes(category)) {
      errors.push(`Category "${category}" is not allowed.`)
    }

    // Validate amount <= max for category
    if (maxAmountPerCategory[category] != null && Number(amount) > maxAmountPerCategory[category]) {
      errors.push(
        `Amount ${amount} exceeds maximum of ${maxAmountPerCategory[category]} for category "${category}".`
      )
    }

    // Validate receipt required
    if (requireReceiptAbove != null && Number(amount) > requireReceiptAbove && !receiptUrl) {
      errors.push(`A receipt is required for amounts above ${requireReceiptAbove}.`)
    }

    // Validate submission deadline
    if (submissionDeadline != null && today.getDate() > submissionDeadline) {
      errors.push(`Submission deadline (day ${submissionDeadline} of the month) has passed.`)
    }

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

  // Convert to the employee's organization base currency (defaults to IDR).
  // amountIDR column reuses the same storage and now holds the amount in base currency.
  const baseCurrency = await getOrgBaseCurrency(session.user.organizationId)
  const { amountBase, exchangeRate } = await convert(Number(amount), currency, baseCurrency)
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

  // Create approval steps if submitted
  if (status === "SUBMITTED") {
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
            requestId: request.id,
            approverId: member.userId,
            order: member.order,
          }
        })
        .filter(Boolean) as { requestId: string; approverId: string; order: number }[]

      if (stepData.length > 0) {
        await prisma.approvalStep.createMany({ data: stepData })
      }
    }
  }

  return NextResponse.json(request, { status: 201 })
}
