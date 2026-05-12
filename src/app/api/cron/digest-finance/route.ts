import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret")
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Each finance user is digested over the slice of approved-unpaid work
  // they're actually responsible for: their cost center, or org-wide if
  // they have no CC assigned.
  const financeUsers = await prisma.user.findMany({
    where: { role: "FINANCE" },
    select: { id: true, name: true, email: true, costCenterId: true },
  })

  let notifiedCount = 0

  for (const finUser of financeUsers) {
    const employeeScope = finUser.costCenterId ? { costCenterId: finUser.costCenterId } : {}
    const approvedUnpaid = await prisma.reimbursementRequest.count({
      where: { status: "APPROVED", employee: employeeScope },
    })
    if (approvedUnpaid === 0) continue
    const totalAmount = await prisma.reimbursementRequest.aggregate({
      where: { status: "APPROVED", employee: employeeScope },
      _sum: { amount: true },
    })
    // Try to send email via Resend if configured
    if (
      process.env.RESEND_API_KEY &&
      process.env.RESEND_API_KEY !== "placeholder" &&
      finUser.email
    ) {
      try {
        const html = `
          <h2>Weekly Finance Digest</h2>
          <p>Hi ${finUser.name ?? "Finance"}, here is your weekly summary:</p>
          <ul>
            <li><strong>${approvedUnpaid}</strong> approved request${approvedUnpaid === 1 ? "" : "s"} awaiting payment</li>
            <li>Total amount: <strong>$${Number(totalAmount._sum.amount || 0).toFixed(2)}</strong></li>
          </ul>
          <p><a href="${process.env.NEXTAUTH_URL}/finance/requests">View Requests</a></p>
        `

        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: "FLUX.AI <noreply@flux.ai>",
          to: finUser.email,
          subject: `FLUX.AI: ${approvedUnpaid} approved request${approvedUnpaid === 1 ? "" : "s"} awaiting payment`,
          html,
        })
      } catch (e) {
        console.error(`Failed to send digest email to ${finUser.email}:`, e)
      }
    }

    // Always create an in-app notification
    await sendNotification({
      userId: finUser.id,
      type: "WEEKLY_DIGEST",
      message: `Weekly summary: ${approvedUnpaid} approved request${approvedUnpaid === 1 ? "" : "s"} ($${Number(totalAmount._sum.amount || 0).toFixed(2)}) awaiting payment.`,
    })

    notifiedCount++
  }

  return NextResponse.json({ financeUsersNotified: notifiedCount })
}
