import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"

interface SendNotificationParams {
  userId: string
  requestId?: string
  type: string
  message: string
}

export async function sendNotification(params: SendNotificationParams) {
  // Get notification channels config
  const config = await getConfig(prisma, "notificationChannels")
  const channels = (config as any) || { email: false, whatsapp: false, inApp: true }

  // Always create in-app notification
  if (channels.inApp !== false) {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        requestId: params.requestId,
        type: params.type,
        message: params.message,
        channel: "IN_APP",
      },
    })
  }

  // Email notification via Resend (if configured)
  if (channels.email && process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== "placeholder") {
    try {
      const user = await prisma.user.findUnique({ where: { id: params.userId } })
      if (user?.email) {
        const { Resend } = await import("resend")
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: "FLUX.AI <noreply@flux.ai>",
          to: user.email,
          subject: `FLUX.AI: ${params.type}`,
          html: `<p>${params.message}</p><p><a href="${process.env.NEXTAUTH_URL}/requests/${params.requestId}">View Request</a></p>`,
        })
      }
    } catch (e) {
      console.error("Email notification failed:", e)
    }
  }
}
