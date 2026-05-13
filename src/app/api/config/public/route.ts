import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSubmissionMonth } from "@/lib/submission-month"
import { getConfig } from "@/lib/config"

// Public config endpoint — returns non-sensitive config values
// for any authenticated user, CC-scoped to the calling user's cost center
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Resolve calling user's org and cost center for CC-scoped config resolution
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { costCenterId: true, organizationId: true },
  })
  const orgId = user?.organizationId ?? null
  const ccId = user?.costCenterId ?? null

  // Fetch all config values with CC-scoped resolution
  const [submissionDeadlineRaw, allowedCategoriesRaw, maxAmtPerCatRaw,
         requireReceiptRaw, approvalDeadlineRaw, paymentDeadlineRaw] =
    await Promise.all([
      getConfig(prisma, "submissionDeadline", orgId, ccId),
      getConfig(prisma, "allowedCategories", orgId, ccId),
      getConfig(prisma, "maxAmountPerCategory", orgId, ccId),
      getConfig(prisma, "requireReceiptAbove", orgId, ccId),
      getConfig(prisma, "approvalDeadline", orgId, ccId),
      getConfig(prisma, "paymentDeadline", orgId, ccId),
    ])

  const result = {
    submissionDeadline: typeof submissionDeadlineRaw === "number" ? submissionDeadlineRaw : null,
    allowedCategories: Array.isArray(allowedCategoriesRaw) ? allowedCategoriesRaw : null,
    maxAmountPerCategory: maxAmtPerCatRaw ?? null,
    requireReceiptAbove: typeof requireReceiptRaw === "number" ? requireReceiptRaw : null,
    approvalDeadline: typeof approvalDeadlineRaw === "number" ? approvalDeadlineRaw : null,
    paymentDeadline: typeof paymentDeadlineRaw === "number" ? paymentDeadlineRaw : null,
    currentSubmissionMonth: await getSubmissionMonth(),
  }

  return NextResponse.json(result)
}
