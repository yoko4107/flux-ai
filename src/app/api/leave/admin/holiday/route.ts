import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/leave/admin/holiday — admin creates a public holiday for the org.
// DELETE /api/leave/admin/holiday/[id] handled in [id]/route.ts.

const Body = z.object({
  name: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countryCode: z.string().length(2).optional(),
  type: z.string().max(40).optional(),
})

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 })
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const org = await prisma.organization.findUnique({ where: { id: session.user.organizationId }, select: { countryCode: true } })
  const countryCode = parsed.data.countryCode ?? org?.countryCode ?? "ID"

  const holiday = await prisma.publicHoliday.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      date: new Date(`${parsed.data.date}T00:00:00Z`),
      countryCode,
      type: parsed.data.type ?? "NATIONAL",
    },
  })
  return NextResponse.json({ holiday }, { status: 201 })
}
