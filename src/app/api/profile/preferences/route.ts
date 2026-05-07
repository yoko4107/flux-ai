import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// User-level preferences for the Leave & Calendar module. Stored on
// UserProfile (separate from the legacy `User.notificationPrefs` field
// used by reimbursement). The two coexist; this route is scoped to the
// new model only.
//
// GET   — returns the caller's UserProfile, lazy-creating one with
//         org-derived defaults if it doesn't exist yet.
// PATCH — updates editable fields.

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let profile = await prisma.userProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: { select: { countryCode: true, baseCurrency: true } } },
    })
    profile = await prisma.userProfile.create({
      data: {
        userId: session.user.id,
        countryCode: u?.organization?.countryCode ?? "ID",
        defaultCurrency: u?.organization?.baseCurrency ?? "IDR",
      },
    })
  }
  return NextResponse.json({ profile })
}

const PatchBody = z.object({
  countryCode: z.string().length(2).optional(),
  timezone: z.string().min(1).max(64).optional(),
  defaultCurrency: z.string().length(3).optional(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]).optional(),
  weekStartsOn: z.number().int().min(0).max(1).optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  photoUrl: z.string().max(2000).nullable().optional(),
  calendarProvider: z.enum(["NONE", "GOOGLE", "LARK", "OUTLOOK", "APPLE_ICS"]).optional(),
  emailActionsEnabled: z.boolean().optional(),
  notifyOnLeaveStatus: z.boolean().optional(),
  notifyOnProposal: z.boolean().optional(),
  notifyBeforeLeave: z.string().nullable().optional(),
  notifyInApp: z.boolean().optional(),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })

  const profile = await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    update: parsed.data,
    create: {
      userId: session.user.id,
      ...parsed.data,
    },
  })
  return NextResponse.json({ profile })
}
