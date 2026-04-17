import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { otp, password, nationalIdUrl, selfieUrl } = body as {
    otp: string
    password?: string
    nationalIdUrl?: string
    selfieUrl?: string
  }

  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
    include: { organization: true },
  })

  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 400 })
  }

  // Verify OTP
  if (!invitation.otp || invitation.otp !== otp) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 400 })
  }
  if (invitation.otpExpiresAt && invitation.otpExpiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired" }, { status: 400 })
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      email: invitation.email,
      name: invitation.email.split("@")[0],
      role: invitation.role,
      organizationId: invitation.orgId ?? null,
      status: "ACTIVE",
      nationalIdUrl: nationalIdUrl ?? null,
      selfieUrl: selfieUrl ?? null,
      kycVerified: !!(nationalIdUrl && selfieUrl),
    },
  })

  // Mark invitation accepted
  await prisma.userInvitation.update({
    where: { token },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  })

  return NextResponse.json({ ok: true, userId: user.id, email: user.email })
}
