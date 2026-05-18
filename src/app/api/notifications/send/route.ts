import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

const ALLOWED_TYPES = [
  "REQUEST_SUBMITTED", "REQUEST_APPROVED", "REQUEST_REJECTED",
  "REQUEST_PAID", "APPROVAL_REQUIRED", "CHANGE_REQUESTED",
  "REMINDER", "GENERAL",
] as const

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { userId, requestId, type, message } = body

  if (!userId || !type || !message) {
    return NextResponse.json({ error: "userId, type, and message are required" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid notification type" }, { status: 400 })
  }

  // Org scoping: ADMIN can only notify users in their own org
  if (session.user.role === "ADMIN") {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })
    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (targetUser.organizationId !== session.user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  await sendNotification({ userId, requestId, type, message })

  return NextResponse.json({ success: true })
}
