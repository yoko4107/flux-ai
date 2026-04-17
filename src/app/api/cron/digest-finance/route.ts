import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret")
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Count APPROVED (unpaid) requests
  const approvedUnpaid = await prisma.reimbursementRequest.count({
    where: { status: "APPROVED" },
  })

  if (approvedUnpaid === 0) {
    return NextResponse.json({ financeUsersNotified: 0, approvedUnpaid: 0 })
  }

  // Get total amount awaiting payment
  const totalAmount = await prisma.reimbursementRequest.aggregate({
    where: { status: "APPROVED" },
    _sum: { amount: true },
  })

  const financeUsers = await prisma.user.findMany({
    where: { role: "FINANCE" },
    select: { id: true, name: true, email: true },
  })

  let notifiedCount = 0

  for (const finUser of financeUsers) {
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

  return NextResponse.json({ financeUsersNotified: notifiedCount, approvedUnpaid })
}
