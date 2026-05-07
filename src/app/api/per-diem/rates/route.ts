import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getRateTable } from "@/lib/per-diem"

// GET /api/per-diem/rates — effective rate table for the caller's org.
// Open to any signed-in user so the request form can populate the
// destination dropdown and preview a daily rate.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!session.user.organizationId) return NextResponse.json({ rates: {} })
  const rates = await getRateTable(session.user.organizationId)
  return NextResponse.json({ rates })
}
