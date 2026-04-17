import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { otp } = await request.json()

  const invitation = await prisma.userInvitation.findUnique({ where: { token } })
  if (!invitation || invitation.status !== "PENDING") return NextResponse.json({ error: "Invalid invitation" }, { status: 400 })
  if (!invitation.otp || !invitation.otpExpiresAt) return NextResponse.json({ error: "No OTP sent yet" }, { status: 400 })
  if (invitation.otpExpiresAt < new Date()) return NextResponse.json({ error: "OTP has expired" }, { status: 400 })
  if (invitation.otp !== otp) return NextResponse.json({ error: "Incorrect OTP" }, { status: 400 })

  return NextResponse.json({ ok: true })
}
