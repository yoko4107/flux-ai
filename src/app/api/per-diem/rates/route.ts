import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRateTable } from "@/lib/per-diem"

// GET /api/per-diem/rates — effective rate table for the caller, scoped
// to their cost center (so a Vietnam-office employee sees VN overrides
// on top of the org defaults). Open to any signed-in user; the request
// form uses this to populate the destination dropdown.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.organizationId) return NextResponse.json({ rates: {} })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { costCenterId: true },
  })
  const rates = await getRateTable(session.user.organizationId, user?.costCenterId)
  return NextResponse.json({ rates })
}
