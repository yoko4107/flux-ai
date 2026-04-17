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
      status: true,
      kycVerified: true,
      createdAt: true,
      notificationPrefs: true,
      organization: { select: { id: true, name: true, slug: true } },
      manager: { select: { id: true, name: true, email: true } },
    },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().optional().nullable(),
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
})

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.department !== undefined ? { department: parsed.data.department } : {}),
      ...(parsed.data.notificationPrefs !== undefined ? { notificationPrefs: parsed.data.notificationPrefs } : {}),
    },
    select: {
      id: true, name: true, department: true, notificationPrefs: true,
    },
  })

  return NextResponse.json(updated)
}
