import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// "Your leave starts tomorrow" reminder for employees.
// Runs daily. Finds approved leaves that start tomorrow (UTC) and sends
// a single in-app notification + a simple email. We keep this lightweight
// because the approval email already shipped a calendar invite.

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  const tomorrowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2))

  const approvedTomorrow = await prisma.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { gte: tomorrowStart, lt: tomorrowEnd },
    },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, name: true, email: true } },
      organization: { select: { name: true } },
      emailEvents: { where: { emailType: "REMINDER_LEAVE" }, select: { id: true } },
    },
  })

  let sent = 0
  for (const r of approvedTomorrow) {
    if (r.emailEvents.length > 0) continue // already reminded
    if (!r.employee.email) continue

    const subject = `Reminder: Your ${r.leaveType.name} leave starts tomorrow`
    await prisma.leaveEmailEvent.create({
      data: {
        leaveRequestId: r.id,
        toEmail: r.employee.email,
        toUserId: r.employee.id,
        emailType: "REMINDER_LEAVE",
        subject,
      },
    })

    const apiKey = process.env.RESEND_API_KEY
    if (apiKey && apiKey !== "placeholder") {
      try {
        const { Resend } = await import("resend")
        const resend = new Resend(apiKey)
        await resend.emails.send({
          from: process.env.LEAVE_EMAIL_FROM || "FLUX.AI <noreply@flux.ai>",
          to: r.employee.email,
          subject,
          html: `<p>Hi ${r.employee.name ?? ""},</p><p>This is a friendly reminder that your <strong>${r.leaveType.name}</strong> leave starts tomorrow and runs through ${r.endDate.toISOString().slice(0, 10)} (${r.totalDays} day${r.totalDays === 1 ? "" : "s"}).</p><p>Have a great time off.</p>`,
          text: `Hi ${r.employee.name ?? ""}, this is a reminder that your ${r.leaveType.name} leave starts tomorrow.`,
        })
      } catch (err) {
        console.error("[leave-reminder] send failed", err)
      }
    }
    sent++
  }

  return NextResponse.json({ scanned: approvedTomorrow.length, sent })
}
