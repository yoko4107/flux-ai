import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"

function resolveOrgId(session: { user: { role: string; organizationId?: string | null } }, raw: string | null) {
  const role = session.user.role
  if (role === "SUPER_ADMIN") {
    if (!raw) return { error: "organizationId required", status: 400 as const }
    return { orgId: raw }
  }
  if (role === "ADMIN") {
    const own = session.user.organizationId
    if (!own) return { error: "Admin has no organization", status: 400 as const }
    return { orgId: own }
  }
  return { error: "Forbidden", status: 403 as const }
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const scope = resolveOrgId(session, searchParams.get("organizationId"))
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status })

  const org = await prisma.organization.findUnique({
    where: { id: scope.orgId },
    select: { id: true, name: true, slug: true, industry: true, logoUrl: true, baseCurrency: true },
  })
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  return NextResponse.json({ organization: org })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = z.object({
    organizationId: z.string().optional(),
    name: z.string().min(1).max(120).optional(),
    industry: z.string().max(120).nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO currency code").optional(),
  }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 })

  const scope = resolveOrgId(session, parsed.data.organizationId ?? null)
  if ("error" in scope) return NextResponse.json({ error: scope.error }, { status: scope.status })

  const existing = await prisma.organization.findUnique({ where: { id: scope.orgId } })
  if (!existing) return NextResponse.json({ error: "Organization not found" }, { status: 404 })

  const data: { name?: string; industry?: string | null; logoUrl?: string | null; baseCurrency?: string } = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.industry !== undefined) data.industry = parsed.data.industry
  if (parsed.data.logoUrl !== undefined) data.logoUrl = parsed.data.logoUrl
  if (parsed.data.baseCurrency !== undefined) data.baseCurrency = parsed.data.baseCurrency

  const updated = await prisma.organization.update({
    where: { id: scope.orgId },
    data,
    select: { id: true, name: true, slug: true, industry: true, logoUrl: true, baseCurrency: true },
  })

  await writeAuditLog(prisma, {
    actorId: session.user.id,
    action: "ORG_BRANDING_UPDATED",
    details: {
      organizationId: scope.orgId,
      changes: data,
      previous: { name: existing.name, industry: existing.industry, logoUrl: existing.logoUrl, baseCurrency: existing.baseCurrency },
    },
  })

  return NextResponse.json({ organization: updated })
}
