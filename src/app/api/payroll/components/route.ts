import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/payroll/components — global library of payroll component
// categories (Basic Salary, Income Tax, BPJS, …). Read-only for any
// signed-in user; admins write via the seed script.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const components = await prisma.payrollComponent.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  })
  return NextResponse.json({ components })
}
