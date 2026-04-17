import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true, slug: true } } },
  })

  if (!invitation) return NextResponse.json({ error: "Invalid invitation link" }, { status: 404 })
  if (invitation.status === "ACCEPTED") return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 })
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invitation link has expired" }, { status: 410 })
  }

  return NextResponse.json({
    email: invitation.email,
    phone: invitation.phone,
    role: invitation.role,
    orgName: invitation.organization?.name ?? null,
  })
}
