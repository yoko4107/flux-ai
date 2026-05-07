import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/leave/admin/types — admin creates a leave type for the org.
//
// Code is uppercase A–Z and underscores; doubles as the stable identifier
// referenced by external systems (e.g. payroll exports).

const Body = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/, "Code must be uppercase letters / digits / underscores"),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  maxDaysPerYear: z.number().int().min(0).max(366).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  isPaid: z.boolean().optional(),
})

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  // Fail loud on duplicate code: don't silently update an existing type.
  const exists = await prisma.leaveType.findUnique({
    where: { organizationId_code: { organizationId: session.user.organizationId, code: parsed.data.code } },
  })
  if (exists) return NextResponse.json({ error: `Code "${parsed.data.code}" already exists` }, { status: 409 })

  const lt = await prisma.leaveType.create({
    data: {
      organizationId: session.user.organizationId,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      colorHex: parsed.data.colorHex ?? "#3B82F6",
      maxDaysPerYear: parsed.data.maxDaysPerYear ?? null,
      requiresApproval: parsed.data.requiresApproval ?? true,
      isPaid: parsed.data.isPaid ?? true,
    },
  })
  return NextResponse.json({ leaveType: lt }, { status: 201 })
}
