import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sendNotification } from "@/lib/notifications"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { userId, requestId, type, message } = body

  if (!userId || !type || !message) {
    return NextResponse.json({ error: "userId, type, and message are required" }, { status: 400 })
  }

  await sendNotification({ userId, requestId, type, message })

  return NextResponse.json({ success: true })
}
