import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      phone: true,
      emailAliases: true,
      status: true,
      kycVerified: true,
      hireDate: true,
      driveFolderId: true,
      createdAt: true,
      notificationPrefs: true,
      organization: { select: { id: true, name: true, slug: true } },
      manager: { select: { id: true, name: true, email: true } },
      profile: { select: { jobTitle: true, employmentType: true, workArrangement: true, employmentStartDate: true, emergencyContact: true, socialLinks: true } },
    },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

const emailAliasSchema = z.object({
  type: z.enum(["work", "personal"]),
  email: z.string().email(),
})

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  relation: z.string().min(1),
})

const socialLinkSchema = z.object({
  platform: z.string().min(1),
  url: z.string().url(),
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  emailAliases: z.array(emailAliasSchema).max(10).optional().nullable(),
  notificationPrefs: z
    .object({
      email: z.boolean(),
      whatsapp: z.boolean(),
      inApp: z.boolean(),
      approvalUpdates: z.boolean(),
      paymentUpdates: z.boolean(),
      weeklyDigest: z.boolean(),
    })
    .optional(),
  emergencyContact: emergencyContactSchema.optional().nullable(),
  socialLinks: z.array(socialLinkSchema).max(10).optional().nullable(),
})

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })

  const { emergencyContact, socialLinks, ...userFields } = parsed.data

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(userFields.name !== undefined ? { name: userFields.name } : {}),
      ...(userFields.department !== undefined ? { department: userFields.department } : {}),
      ...(userFields.phone !== undefined ? { phone: userFields.phone } : {}),
      ...(userFields.emailAliases !== undefined ? { emailAliases: userFields.emailAliases ?? [] } : {}),
      ...(userFields.notificationPrefs !== undefined ? { notificationPrefs: userFields.notificationPrefs } : {}),
      ...(emergencyContact !== undefined || socialLinks !== undefined
        ? {
            profile: {
              upsert: {
                create: {
                  ...(emergencyContact !== undefined ? { emergencyContact } : {}),
                  ...(socialLinks !== undefined ? { socialLinks: socialLinks ?? [] } : {}),
                },
                update: {
                  ...(emergencyContact !== undefined ? { emergencyContact } : {}),
                  ...(socialLinks !== undefined ? { socialLinks: socialLinks ?? [] } : {}),
                },
              },
            },
          }
        : {}),
    },
    select: {
      id: true, name: true, department: true, phone: true, emailAliases: true, notificationPrefs: true,
      profile: { select: { emergencyContact: true, socialLinks: true } },
    },
  })

  return NextResponse.json(updated)
}
