import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { utcDateOnly } from "@/lib/leave-utils"

const Body = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().optional(),
  category: z.enum(["COMPANY", "SPECIAL", "TRAINING", "OTHER"]).optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  location: z.string().max(200).nullable().optional(),
})

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

// POST /api/leave/admin/events — create a company event for the org.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const start = utcDateOnly(parsed.data.startDate)
  const end = utcDateOnly(parsed.data.endDate)
  if (end < start) return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 })

  const event = await prisma.companyEvent.create({
    data: {
      organizationId: session.user.organizationId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      startDate: start,
      endDate: end,
      allDay: parsed.data.allDay ?? true,
      category: parsed.data.category ?? "COMPANY",
      colorHex: parsed.data.colorHex ?? "#22D3EE",
      location: parsed.data.location ?? null,
      createdById: session.user.id,
    },
  })
  return NextResponse.json({ event }, { status: 201 })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!session.user.organizationId) return NextResponse.json({ events: [] })

  const events = await prisma.companyEvent.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { startDate: "desc" },
    take: 200,
  })
  return NextResponse.json({ events })
}
