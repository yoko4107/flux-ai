import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const
type Role = typeof ROLES[number]

function toExportUrl(input: string): string | null {
  // Already a CSV export URL
  if (input.includes("/export?format=csv")) return input

  // Standard share URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=GID
  const match = input.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!match) return null

  const sheetId = match[1]
  const gidMatch = input.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : "0"

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
}

function parseCSV(text: string): { email: string; role: Role; phone?: string; name?: string }[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  const results: { email: string; role: Role; phone?: string; name?: string }[] = []

  // Detect if first row is a header
  const firstLine = lines[0].toLowerCase()
  const startIdx = firstLine.includes("email") ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith("#")) continue

    const cols = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
    const [col1, col2, col3, col4] = cols

    let email = ""
    let role: Role = "EMPLOYEE"
    let phone: string | undefined
    let name: string | undefined

    // Try to detect which column is the email
    if (col1?.includes("@")) {
      email = col1
      role = ROLES.includes((col2?.toUpperCase() ?? "") as Role) ? (col2.toUpperCase() as Role) : "EMPLOYEE"
      phone = col3 || undefined
      name = col4 || undefined
    } else if (col2?.includes("@")) {
      // name, email, role, phone
      name = col1
      email = col2
      role = ROLES.includes((col3?.toUpperCase() ?? "") as Role) ? (col3.toUpperCase() as Role) : "EMPLOYEE"
      phone = col4 || undefined
    } else {
      continue
    }

    if (!email || !email.includes("@")) continue
    results.push({ email, role, phone, name })
  }

  return results
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { url } = body as { url?: string }
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  const exportUrl = toExportUrl(url.trim())
  if (!exportUrl) {
    return NextResponse.json({ error: "Could not parse Google Sheets URL. Make sure the spreadsheet is publicly accessible." }, { status: 400 })
  }

  let csvText: string
  try {
    const res = await fetch(exportUrl, {
      headers: { "Accept": "text/csv" },
      // 10 second timeout
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch the sheet (HTTP ${res.status}). Make sure it is shared publicly as "Anyone with the link can view".` },
        { status: 422 }
      )
    }
    csvText = await res.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return NextResponse.json({ error: `Failed to fetch sheet: ${msg}` }, { status: 422 })
  }

  const rows = parseCSV(csvText)
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Expected columns: email, role (EMPLOYEE/APPROVER/FINANCE/ADMIN), phone (optional). Optionally name,email,role,phone." },
      { status: 422 }
    )
  }

  return NextResponse.json({ rows, count: rows.length })
}
