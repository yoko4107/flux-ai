import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/leave/types — leave types available to the caller's organization.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.organizationId) return NextResponse.json({ leaveTypes: [] })

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { name: "asc" },
  })
  return NextResponse.json({ leaveTypes })
}
