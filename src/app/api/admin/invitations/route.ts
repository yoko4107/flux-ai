import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const invitations = await prisma.userInvitation.findMany({
    where: isSuperAdmin ? {} : { orgId: session.user.organizationId ?? "" },
    include: {
      invitedBy: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
    orderBy: { sentAt: "desc" },
  })
  return NextResponse.json(invitations)
}
