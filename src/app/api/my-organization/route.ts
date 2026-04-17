import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const orgId = session.user.organizationId
  if (!orgId) return NextResponse.json({ organization: null })

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, logoUrl: true },
  })
  return NextResponse.json({ organization: org })
}
