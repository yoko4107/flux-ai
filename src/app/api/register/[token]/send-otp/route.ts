import { NextResponse } from "next/server"
import { randomInt } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"

function generateOtp() {
  return randomInt(100000, 1000000).toString()
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!rateLimit(`send-otp:${token}`, 5, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

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

  if (process.env.NODE_ENV === "development") {
    console.log(`[DEV] OTP for token ${token}: ${otp}`)
  }

  return NextResponse.json({ ok: true, message: `OTP sent to ${invitation.email}` })
}
