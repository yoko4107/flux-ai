import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const inviteRowSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const).default("EMPLOYEE"),
  phone: z.string().optional(),
})

const bulkSchema = z.object({
  invites: z.array(inviteRowSchema).min(1).max(200),
  orgId: z.string().optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })

  const { invites, orgId } = parsed.data
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const results = []
  for (const invite of invites) {
    const effectiveOrgId = isSuperAdmin ? (orgId ?? null) : (session.user.organizationId ?? null)

    // Skip if already a user
    const existingUser = await prisma.user.findUnique({ where: { email: invite.email } })
    if (existingUser) {
      results.push({ email: invite.email, status: "skipped", reason: "User already exists" })
      continue
    }
    // Expire old pending invites for this email
    await prisma.userInvitation.updateMany({
      where: { email: invite.email, status: "PENDING" },
      data: { status: "EXPIRED" },
    })
    const invitation = await prisma.userInvitation.create({
      data: {
        email: invite.email,
        phone: invite.phone,
        role: invite.role,
        orgId: effectiveOrgId,
        invitedById: session.user.id,
        expiresAt,
      },
    })
    // In production: send email. In dev: log the link
    const registrationLink = `http://localhost:3000/register/${invitation.token}`
    console.log(`[INVITE] ${invite.email} → ${registrationLink}`)
    results.push({ email: invite.email, status: "invited", token: invitation.token, link: registrationLink })
  }

  return NextResponse.json({ results })
}
