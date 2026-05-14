import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"

function isAdmin(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

function toExportUrl(input: string): string | null {
  if (input.includes("/export?format=csv")) return input
  const match = input.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!match) return null
  const sheetId = match[1]
  const gidMatch = input.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : "0"
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

export function parseSalaryCSV(
  text: string,
  defaultCurrency: string
): { email: string; baseSalary: number; currency: string; workingDaysPerMonth: number; startedAt: string }[] {
  const today = new Date().toISOString().slice(0, 10)
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return []

  const firstLine = lines[0].toLowerCase()
  const hasHeader = firstLine.includes("email") || firstLine.includes("salary")
  const startIdx = hasHeader ? 1 : 0

  const results: { email: string; baseSalary: number; currency: string; workingDaysPerMonth: number; startedAt: string }[] = []

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith("#")) continue
    const cols = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))

    // Detect email column
    let emailIdx = cols.findIndex((c) => c.includes("@"))
    if (emailIdx === -1) continue

    const email = cols[emailIdx]
    // baseSalary is the first numeric column after email
    let baseSalary = NaN
    let currency = defaultCurrency
    let workingDaysPerMonth = 22
    let startedAt = today

    // Try flexible column mapping: look for numeric values
    for (let j = 0; j < cols.length; j++) {
      if (j === emailIdx) continue
      const val = cols[j]
      if (!val) continue

      const num = Number(val.replace(/[,_]/g, ""))
      if (!isNaN(num) && isNaN(baseSalary) && num > 0) {
        baseSalary = num
        continue
      }
      if (/^[A-Z]{3}$/i.test(val) && val.length === 3) {
        currency = val.toUpperCase()
        continue
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        startedAt = val.slice(0, 10)
        continue
      }
      const days = parseInt(val, 10)
      if (!isNaN(days) && days >= 1 && days <= 31 && !isNaN(baseSalary)) {
        workingDaysPerMonth = days
        continue
      }
    }

    if (!email || isNaN(baseSalary) || baseSalary <= 0) continue
    results.push({ email, baseSalary, currency, workingDaysPerMonth, startedAt })
  }

  return results
}

const RowSchema = z.object({
  email: z.string().email(),
  baseSalary: z.number().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  workingDaysPerMonth: z.number().int().min(1).max(31).default(22),
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const Body = z.union([
  z.object({
    mode: z.literal("rows"),
    rows: z.array(RowSchema).min(1).max(500),
    costCenterId: z.string(),
  }),
  z.object({
    mode: z.literal("sheets"),
    url: z.string().url(),
    costCenterId: z.string(),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  }),
  z.object({
    mode: z.literal("csv"),
    csv: z.string().max(500_000),
    costCenterId: z.string(),
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  }),
])

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 })
  }

  const body = parsed.data
  let rows: z.infer<typeof RowSchema>[] = []

  if (body.mode === "rows") {
    rows = body.rows
  } else if (body.mode === "sheets") {
    const exportUrl = toExportUrl(body.url)
    if (!exportUrl) return NextResponse.json({ error: "Invalid Google Sheets URL" }, { status: 400 })
    try {
      const res = await fetch(exportUrl, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return NextResponse.json({ error: `Could not fetch sheet (HTTP ${res.status}). Make sure it is shared publicly.` }, { status: 422 })
      const text = await res.text()
      const rawRows = parseSalaryCSV(text, body.defaultCurrency)
      const validated = rawRows.map((r) => RowSchema.safeParse(r)).filter((r) => r.success).map((r) => (r as { success: true; data: z.infer<typeof RowSchema> }).data)
      if (validated.length === 0) return NextResponse.json({ error: "No valid salary rows found in sheet. Expected columns: email, baseSalary, currency (optional), workingDaysPerMonth (optional), startedAt (optional)." }, { status: 422 })
      rows = validated
    } catch (err) {
      return NextResponse.json({ error: `Failed to fetch sheet: ${err instanceof Error ? err.message : "Network error"}` }, { status: 422 })
    }
  } else {
    const rawRows = parseSalaryCSV(body.csv, body.defaultCurrency)
    const validated = rawRows.map((r) => RowSchema.safeParse(r)).filter((r) => r.success).map((r) => (r as { success: true; data: z.infer<typeof RowSchema> }).data)
    if (validated.length === 0) return NextResponse.json({ error: "No valid salary rows found in CSV." }, { status: 422 })
    rows = validated
  }

  // Resolve emails → user IDs within this org
  const emails = rows.map((r) => r.email.toLowerCase())
  const users = await prisma.user.findMany({
    where: {
      email: { in: emails },
      ...(session.user.role === "ADMIN" ? { organizationId: session.user.organizationId ?? undefined } : {}),
    },
    select: { id: true, email: true, organizationId: true, costCenterId: true },
  })

  const userMap = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]))

  const results: { email: string; status: "ok" | "skipped"; reason?: string }[] = []

  for (const row of rows) {
    const user = userMap.get(row.email.toLowerCase())
    if (!user) {
      results.push({ email: row.email, status: "skipped", reason: "User not found in organisation" })
      continue
    }
    if (!user.organizationId) {
      results.push({ email: row.email, status: "skipped", reason: "User has no organisation" })
      continue
    }
    try {
      await prisma.employeeCompensation.upsert({
        where: { employeeId: user.id },
        update: {
          baseSalary: row.baseSalary,
          currency: row.currency,
          workingDaysPerMonth: row.workingDaysPerMonth,
          startedAt: new Date(row.startedAt),
          costCenterId: user.costCenterId ?? null,
          componentOverrides: Prisma.JsonNull,
        },
        create: {
          organizationId: user.organizationId,
          employeeId: user.id,
          costCenterId: user.costCenterId ?? null,
          baseSalary: row.baseSalary,
          currency: row.currency,
          workingDaysPerMonth: row.workingDaysPerMonth,
          startedAt: new Date(row.startedAt),
          componentOverrides: Prisma.JsonNull,
        },
      })
      results.push({ email: row.email, status: "ok" })
    } catch {
      results.push({ email: row.email, status: "skipped", reason: "Database error" })
    }
  }

  const saved = results.filter((r) => r.status === "ok").length
  const skipped = results.filter((r) => r.status === "skipped").length
  return NextResponse.json({ saved, skipped, results })
}
