import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const h = await prisma.publicHoliday.findUnique({ where: { id } })
  if (!h) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Org admins can only delete holidays in their org.
  if (session.user.role === "ADMIN" && h.organizationId !== session.user.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await prisma.publicHoliday.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
