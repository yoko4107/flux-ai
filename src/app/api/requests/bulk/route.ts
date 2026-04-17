import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { getSubmissionMonth } from "@/lib/submission-month"
import { convertToIDR } from "@/lib/fx-rates"
import { Category, Prisma } from "@/generated/prisma"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE = 10 * 1024 * 1024
const MAX_FILES = 20

interface BulkItem {
  index: number
  filename: string
  url?: string
  ocrResult?: Record<string, unknown>
  title?: string
  amount?: number
  currency?: string
  category?: string
  status: "success" | "error" | "pending"
  error?: string
  requestId?: string
}

function detectChargeType(text: string): string {
  const lower = text.toLowerCase()
  if (lower.match(/uber|grab|taxi|lyft|gojek|bus|train|flight|airline|airport|transport|parking|toll|fuel|gas|petrol/)) return "transport"
  if (lower.match(/restaurant|cafe|coffee|food|lunch|dinner|breakfast|mcdonald|starbucks|eat|meal|catering/)) return "food"
  if (lower.match(/hotel|airbnb|hostel|inn|resort|accommodation|lodging|stay/)) return "accommodation"
  if (lower.match(/office|stationery|paper|printer|ink|supply|supplies|equipment|amazon|shopee|lazada/)) return "office supplies"
  if (lower.match(/phone|internet|mobile|telecom|wifi|subscription|software|saas/)) return "telecom/software"
  return "other"
}

// OCR text parsing (simplified to match /api/ocr/parse)
function parseTextToReceipt(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const currentYear = new Date().getFullYear()

  // Extract date — try DATE: DD/MM format first
  let date: string | undefined
  const dateFieldMatch = text.match(/DATE[:\s]*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/i)
  if (dateFieldMatch) {
    const day = parseInt(dateFieldMatch[1], 10)
    const month = parseInt(dateFieldMatch[2], 10)
    let year = dateFieldMatch[3] ? parseInt(dateFieldMatch[3], 10) : currentYear
    if (year < 100) year += 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    }
  }
  if (!date) {
    const datePatterns = [
      /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/,
      /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    ]
    for (const pattern of datePatterns) {
      const match = text.match(pattern)
      if (match) {
        const d = new Date(match[0])
        if (!isNaN(d.getTime())) { date = d.toISOString().split("T")[0]; break }
      }
    }
  }

  // Extract amount — handle Rp (Indonesian) and standard formats
  let amount: number | undefined
  const rpMatch = text.match(/Rp\.?\s*([\d.]+)/i)
  if (rpMatch) {
    amount = parseInt(rpMatch[1].replace(/\./g, ""), 10)
  }
  if (amount === undefined) {
    const totalPatterns = [
      /total[:\s]*(?:Rp\.?\s*)?\$?\s*([\d.,]+)/i,
      /amount[:\s]*(?:Rp\.?\s*)?\$?\s*([\d.,]+)/i,
      /grand\s+total[:\s]*\$?\s*([\d.,]+)/i,
    ]
    for (const pattern of totalPatterns) {
      const match = text.match(pattern)
      if (match) {
        const raw = match[1]
        const dotParts = raw.split(".")
        if (dotParts.length > 1 && dotParts[dotParts.length - 1].length === 3) {
          amount = parseInt(raw.replace(/\./g, ""), 10)
        } else {
          amount = parseFloat(raw.replace(",", ""))
        }
        break
      }
    }
  }

  let currency: string | undefined
  if (text.match(/Rp|IDR/i)) currency = "IDR"
  else if (text.match(/\$|USD/)) currency = "USD"
  else if (text.match(/€|EUR/)) currency = "EUR"
  else if (text.match(/£|GBP/)) currency = "GBP"
  else if (text.match(/S\$|SGD/)) currency = "SGD"
  else if (text.match(/RM|MYR/)) currency = "MYR"

  let source: string | undefined
  for (const line of lines) {
    if (line.length < 3) continue
    if (line.match(/^[^a-zA-Z]*$/)) continue
    if (line.match(/^[=\-_*#]+$/)) continue
    source = line
    break
  }
  const chargeType = detectChargeType(text)

  return { date, amount, source, chargeType, currency, rawText: text }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const files = formData.getAll("files") as File[]
  const action = (formData.get("action") as string) || "draft" // "draft" or "submit"
  const defaultCategory = (formData.get("category") as string) || "OTHER"
  const defaultCurrency = (formData.get("currency") as string) || "IDR"

  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_FILES} files per upload` },
      { status: 400 }
    )
  }

  // Load config for validation if submitting
  let configs: Record<string, unknown> = {}
  if (action === "submit") {
    const allConfigs = await prisma.adminConfig.findMany()
    for (const c of allConfigs) configs[c.key] = c.value
  }

  const results: BulkItem[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const item: BulkItem = {
      index: i,
      filename: file.name,
      status: "pending",
    }

    // Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      item.status = "error"
      item.error = "Invalid file type"
      results.push(item)
      continue
    }
    if (file.size > MAX_SIZE) {
      item.status = "error"
      item.error = "File too large (max 10MB)"
      results.push(item)
      continue
    }

    try {
      // Upload file
      const rawExt = file.name.split(".").pop() ?? "bin"
      const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const blobToken = process.env.BLOB_READ_WRITE_TOKEN
      const useFallback = !blobToken || blobToken === "placeholder"

      let url: string
      if (!useFallback) {
        const { put } = await import("@vercel/blob")
        const blob = await put(filename, file, { access: "public" })
        url = blob.url
      } else {
        const dir = "/tmp/receipts"
        await mkdir(dir, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        await writeFile(path.join(dir, filename), buffer)
        url = `/api/files/${filename}`
      }

      item.url = url

      // Skip server-side OCR for bulk uploads (too slow).
      // Files are saved as drafts — user can edit in the spreadsheet view.
      // Title derived from filename.
      const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
      const amount = 0
      const currency = defaultCurrency
      const parsedData: Record<string, unknown> = {}

      item.title = title
      item.amount = amount
      item.currency = currency
      item.ocrResult = parsedData

      // Month always based on current date + deadline cutoff, not receipt date
      const month = await getSubmissionMonth()

      // Determine category from filename/content heuristics
      const lowerTitle = title.toLowerCase()
      let category = defaultCategory
      if (lowerTitle.match(/travel|flight|hotel|uber|grab|taxi|transport|airline/)) category = "TRAVEL"
      else if (lowerTitle.match(/meal|food|lunch|dinner|breakfast|restaurant|cafe|coffee/)) category = "MEALS"
      else if (lowerTitle.match(/supply|office|supplies|stationery|equipment|amazon/)) category = "SUPPLIES"

      if (!Object.values(Category).includes(category as Category)) {
        category = "OTHER"
      }

      item.category = category

      // Validate if submitting
      const status = action === "submit" ? "SUBMITTED" : "DRAFT"
      const validationErrors: string[] = []

      if (status === "SUBMITTED") {
        const maxPerCat = (configs.maxAmountPerCategory as Record<string, number>) ?? {}
        const reqReceiptConfig = configs.requireReceiptAbove as { amount?: number } | null
        const deadlineConfig = configs.submissionDeadline as { day?: number } | null
        const deadlineDay = deadlineConfig?.day ?? 20
        const allowedConfig = configs.allowedCategories as { categories?: string[] } | null
        const allowed = allowedConfig?.categories ?? Object.values(Category)

        // suppress unused var warning
        void reqReceiptConfig

        if (!allowed.includes(category)) validationErrors.push(`Category not allowed`)
        if (maxPerCat[category] != null && amount > maxPerCat[category])
          validationErrors.push(`Amount exceeds max for ${category}`)
        if (new Date().getDate() > deadlineDay)
          validationErrors.push(`Past submission deadline`)

        if (validationErrors.length > 0) {
          item.status = "error"
          item.error = validationErrors.join("; ")
          results.push(item)
          continue
        }
      }

      // Convert to IDR
      const { amountIDR: idrAmount, exchangeRate: fxRate } = await convertToIDR(amount || 0, currency)

      // Create the request
      const request = await prisma.reimbursementRequest.create({
        data: {
          employeeId: session.user.id,
          title,
          amount: amount || 0,
          currency,
          category: category as Category,
          receiptUrl: url,
          parsedData: Object.keys(parsedData).length > 0 ? (parsedData as Prisma.InputJsonValue) : Prisma.JsonNull,
          status,
          month,
          submittedAt: status === "SUBMITTED" ? new Date() : null,
          amountIDR: idrAmount,
          exchangeRate: fxRate,
        },
      })

      item.requestId = request.id

      await writeAuditLog(prisma, {
        requestId: request.id,
        actorId: session.user.id,
        action: "REQUEST_CREATED",
        details: { status, amount, category, source: "bulk_upload" },
      })

      // Create approval steps if submitting
      if (status === "SUBMITTED") {
        const approvalCommitteeConfig = await prisma.adminConfig.findUnique({
          where: { key: "approvalCommittee" },
        })
        const committeeValue = approvalCommitteeConfig?.value as {
          members?: Array<{ userId: string; order: number }>
        } | null
        const members = committeeValue?.members ?? []

        if (members.length > 0) {
          const stepData = members
            .sort((a, b) => a.order - b.order)
            .map((m) => ({
              requestId: request.id,
              approverId: m.userId,
              order: m.order,
            }))
          await prisma.approvalStep.createMany({ data: stepData })
        }
      }

      item.status = "success"
    } catch (err) {
      item.status = "error"
      item.error = String(err)
    }

    results.push(item)
  }

  const successCount = results.filter((r) => r.status === "success").length
  const errorCount = results.filter((r) => r.status === "error").length

  return NextResponse.json({
    total: files.length,
    success: successCount,
    errors: errorCount,
    results,
  })
}
