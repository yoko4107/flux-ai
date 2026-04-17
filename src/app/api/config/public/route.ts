import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSubmissionMonth } from "@/lib/submission-month"

// Public config endpoint — returns non-sensitive config values
// for any authenticated user (submission deadline, allowed categories, etc.)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const configs = await prisma.adminConfig.findMany({
    where: {
      key: {
        in: [
          "submissionDeadline",
          "allowedCategories",
          "maxAmountPerCategory",
          "requireReceiptAbove",
        ],
      },
    },
    select: { key: true, value: true },
  })

  const result: Record<string, unknown> = {}
  for (const c of configs) {
    result[c.key] = c.value
  }

  // Include the computed current submission month
  result.currentSubmissionMonth = await getSubmissionMonth()

  return NextResponse.json(result)
}
