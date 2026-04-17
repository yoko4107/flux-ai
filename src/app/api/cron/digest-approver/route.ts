import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret")
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Find all approver users
  const approvers = await prisma.user.findMany({
    where: { role: "APPROVER" },
    select: { id: true, name: true, email: true },
  })

  let notifiedCount = 0

  for (const approver of approvers) {
    const pendingCount = await prisma.approvalStep.count({
      where: { approverId: approver.id, status: "PENDING" },
    })

    if (pendingCount === 0) continue

    // Try to send email via Resend if configured
    if (
      process.env.RESEND_API_KEY &&
      process.env.RESEND_API_KEY !== "placeholder" &&
      approver.email
    ) {
      try {
        const pendingSteps = await prisma.approvalStep.findMany({
          where: { approverId: approver.id, status: "PENDING" },
          include: {
            request: {
              select: { id: true, title: true, amount: true, currency: true },
              include: { employee: { select: { name: true } } },
            },
          },
          take: 10,
        })

        const tableRows = pendingSteps
          .map(
            (step) =>
              `<tr><td style="padding:4px 8px;border:1px solid #ddd">${step.request.title}</td><td style="padding:4px 8px;border:1px solid #ddd">${step.request.employee.name ?? "Unknown"}</td><td style="padding:4px 8px;border:1px solid #ddd">${step.request.currency} ${Number(step.request.amount).toFixed(2)}</td></tr>`
          )
          .join("")

        const html = `
          <h2>Daily Approval Digest</h2>
          <p>Hi ${approver.name ?? "Approver"}, you have <strong>${pendingCount}</strong> pending request${pendingCount === 1 ? "" : "s"} to review.</p>
          <table style="border-collapse:collapse;width:100%">
            <thead><tr>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Title</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Employee</th>
              <th style="padding:4px 8px;border:1px solid #ddd;text-align:left">Amount</th>
            </tr></thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p><a href="${process.env.NEXTAUTH_URL}/approver/queue">Review Now</a></p>
        `

        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: "FLUX.AI <noreply@flux.ai>",
          to: approver.email,
          subject: `FLUX.AI: You have ${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`,
          html,
        })
      } catch (e) {
        console.error(`Failed to send digest email to ${approver.email}:`, e)
      }
    }

    // Always create an in-app notification as fallback
    await sendNotification({
      userId: approver.id,
      type: "DAILY_DIGEST",
      message: `You have ${pendingCount} pending request${pendingCount === 1 ? "" : "s"} to review.`,
    })

    notifiedCount++
  }

  return NextResponse.json({ approversNotified: notifiedCount })
}
