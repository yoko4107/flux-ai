import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await prisma.userInvitation.findUnique({ where: { token } })

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 })
  }

  const otp = generateOtp()
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  await prisma.userInvitation.update({
    where: { token },
    data: { otp, otpExpiresAt },
  })

  console.log(`[OTP] ${invitation.email} → ${otp}`)

  // In dev mode we return the OTP so the UI can display it
  return NextResponse.json({
    ok: true,
    devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
    message: `OTP sent to ${invitation.email}`
  })
}
