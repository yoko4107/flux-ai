import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"
import { detectMultiTransaction, type LineItem } from "@/lib/receipt-parser"

interface ParsedReceipt {
  date?: string
  amount?: number
  source?: string
  chargeType?: string
  currency?: string
  rawText?: string
  message?: string
  items?: LineItem[]
  itemCount?: number
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

function parseTextToReceipt(text: string): ParsedReceipt {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)
  const rawText = text

  // Extract date (common formats)
  let date: string | undefined
  const currentYear = new Date().getFullYear()

  // Try DATE: DD/MM or DATE: DD/MM/YY or DATE: DD/MM/YYYY first (common on receipts)
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
      /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/,  // YYYY-MM-DD
      /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,  // DD/MM/YYYY
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
    ]
    for (const pattern of datePatterns) {
      const match = text.match(pattern)
      if (match) {
        const d = new Date(match[0])
        if (!isNaN(d.getTime())) {
          date = d.toISOString().split("T")[0]
          break
        }
      }
    }
  }

  // Extract total amount — supports both dot-decimal (1,234.56) and dot-thousands (1.234.000) formats
  let amount: number | undefined
  // Try "Rp" format first (Indonesian: Rp 662.000 means 662000)
  const rpMatch = text.match(/Rp\.?\s*([\d.]+)/i)
  if (rpMatch) {
    // Indonesian format: dots are thousands separators
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
        let raw = match[1]
        // Determine if dots are decimal or thousands: "662.000" = 662000, "662.50" = 662.50
        const dotParts = raw.split(".")
        if (dotParts.length > 1 && dotParts[dotParts.length - 1].length === 3) {
          // Dots are thousands separators (e.g. 662.000 or 1.234.000)
          amount = parseInt(raw.replace(/\./g, ""), 10)
        } else {
          // Standard decimal format
          amount = parseFloat(raw.replace(",", ""))
        }
        break
      }
    }
  }

  // Extract currency
  let currency: string | undefined
  if (text.match(/Rp|IDR/i)) currency = "IDR"
  else if (text.match(/\$|USD/)) currency = "USD"
  else if (text.match(/€|EUR/)) currency = "EUR"
  else if (text.match(/£|GBP/)) currency = "GBP"
  else if (text.match(/S\$|SGD/)) currency = "SGD"
  else if (text.match(/RM|MYR/)) currency = "MYR"
  else if (text.match(/¥|JPY|CNY/)) currency = "JPY"
  else if (text.match(/₹|INR/)) currency = "INR"
  else if (text.match(/₩|KRW/)) currency = "KRW"
  else if (text.match(/฿|THB/)) currency = "THB"
  else if (text.match(/₱|PHP/)) currency = "PHP"
  else if (text.match(/₫|VND/)) currency = "VND"

  // Extract source (merchant/vendor name)
  // Skip very short lines, garbled text, and look for a meaningful name
  let source: string | undefined
  for (const line of lines) {
    // Skip lines that are too short, all-caps single words < 3 chars, or look like noise
    if (line.length < 3) continue
    if (line.match(/^[^a-zA-Z]*$/)) continue // no letters at all
    if (line.match(/^[=\-_*#]+$/)) continue  // separator lines
    // First reasonable line is likely the merchant/bank name
    source = line
    break
  }

  // Detect charge type from text content
  const chargeType = detectChargeType(text)

  // Multi-transaction detection (e.g. Grab activity history with several rides).
  // If we find 2+ amount lines that don't reconcile to a single "Total", sum them.
  const multi = detectMultiTransaction(text, currency, amount)
  if (multi) {
    amount = multi.total
  }

  return {
    date,
    amount,
    source,
    chargeType,
    currency,
    rawText,
    items: multi?.items,
    itemCount: multi?.items.length,
  }
}

async function parseWithGoogleVision(url: string, apiKey: string): Promise<ParsedReceipt> {
  let imagePayload: Record<string, unknown>

  // Local files need base64 encoding for Google Vision
  if (url.startsWith("/api/files/")) {
    const { readFile } = await import("fs/promises")
    const path = await import("path")
    const filename = url.replace("/api/files/", "").replace(/[^a-zA-Z0-9._-]/g, "")
    const filePath = path.join("/tmp/receipts", filename)
    const fileBuffer = await readFile(filePath)
    imagePayload = { content: fileBuffer.toString("base64") }
  } else {
    imagePayload = { source: { imageUri: url } }
  }

  const body = {
    requests: [
      {
        image: imagePayload,
        features: [{ type: "TEXT_DETECTION" }],
      },
    ],
  }

  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    throw new Error(`Google Vision API error: ${res.status}`)
  }

  const data = await res.json()
  const text =
    data.responses?.[0]?.fullTextAnnotation?.text ??
    data.responses?.[0]?.textAnnotations?.[0]?.description ??
    ""

  return parseTextToReceipt(text)
}

async function parseWithTesseract(url: string): Promise<ParsedReceipt> {
  let buffer: ArrayBuffer

  // Handle local file URLs (e.g. /api/files/xxx) by reading from disk directly
  if (url.startsWith("/api/files/")) {
    const { readFile } = await import("fs/promises")
    const path = await import("path")
    const filename = url.replace("/api/files/", "").replace(/[^a-zA-Z0-9._-]/g, "")
    const filePath = path.join("/tmp/receipts", filename)
    try {
      const fileBuffer = await readFile(filePath)
      buffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength)
    } catch {
      throw new Error("Failed to read local file for OCR")
    }
  } else {
    // Fetch remote image
    const imgRes = await fetch(url)
    if (!imgRes.ok) throw new Error("Failed to fetch image for OCR")
    buffer = await imgRes.arrayBuffer()
  }

  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("eng")
  const { data } = await worker.recognize(Buffer.from(buffer))
  await worker.terminate()

  return parseTextToReceipt(data.text)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!rateLimit(`ocr:${session.user.id}`, 10, 60000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const body = await req.json()
  const { url } = body

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 })
  }

  // Skip OCR for PDFs
  if (url.toLowerCase().endsWith(".pdf") || url.includes("application/pdf")) {
    return NextResponse.json({
      message: "PDF files are not supported for OCR. Please enter details manually.",
    })
  }

  const googleApiKey = process.env.GOOGLE_VISION_API_KEY
  const useGoogle = googleApiKey && googleApiKey !== "placeholder"

  try {
    let result: ParsedReceipt
    if (useGoogle) {
      result = await parseWithGoogleVision(url, googleApiKey)
    } else {
      result = await parseWithTesseract(url)
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error("OCR parse error:", err)
    return NextResponse.json(
      { error: "OCR parsing failed", rawText: "" },
      { status: 500 }
    )
  }
}
