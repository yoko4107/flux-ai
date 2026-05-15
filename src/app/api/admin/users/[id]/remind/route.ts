import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: userId } = await params
  const orgId = session.user.organizationId

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, organizationId: true, costCenterId: true, role: true },
  })
  if (!user || !user.email) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  if (!isSuperAdmin && user.organizationId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Expire any existing pending invitations for this email
  await prisma.userInvitation.updateMany({
    where: { email: user.email, status: "PENDING" },
    data: { status: "EXPIRED" },
  })

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const invitation = await prisma.userInvitation.create({
    data: {
      email: user.email,
      role: user.role as "EMPLOYEE" | "APPROVER" | "FINANCE" | "ADMIN",
      orgId: user.organizationId ?? undefined,
      costCenterId: user.costCenterId ?? undefined,
      invitedById: session.user.id,
      expiresAt,
    },
  })

  const baseUrl = (process.env.NEXTAUTH_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const registrationLink = `${baseUrl}/register/${invitation.token}`

  return NextResponse.json({ ok: true, registrationLink })
}
