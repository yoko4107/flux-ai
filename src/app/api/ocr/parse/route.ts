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

// Read an image URL (local /api/files/... or remote) into base64 + mime.
async function loadImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  if (url.startsWith("/api/files/")) {
    const { readFile } = await import("fs/promises")
    const path = await import("path")
    const filename = url.replace("/api/files/", "").replace(/[^a-zA-Z0-9._-]/g, "")
    const filePath = path.join("/tmp/receipts", filename)
    const buffer = await readFile(filePath)
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpeg"
    const mimeType =
      ext === "png" ? "image/png" :
      ext === "webp" ? "image/webp" :
      ext === "heic" ? "image/heic" :
      "image/jpeg"
    return { base64: buffer.toString("base64"), mimeType }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error("Failed to fetch image")
  const mimeType = res.headers.get("content-type") ?? "image/jpeg"
  const ab = await res.arrayBuffer()
  return { base64: Buffer.from(ab).toString("base64"), mimeType }
}

async function parseWithGemini(url: string, apiKey: string): Promise<ParsedReceipt> {
  const { base64, mimeType } = await loadImageAsBase64(url)
  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview"

  const prompt = `You are an OCR system for expense receipts. Extract structured data from the image.

The image may be either:
A) A single receipt (one merchant transaction).
B) An activity / transaction history listing multiple separate transactions
   (e.g. Grab activity history, bank statement, ride history). In this case
   each row is its own transaction and they MUST all appear in "items".

Rules:
- "currency" must be a valid ISO-4217 code (IDR, VND, USD, SGD, MYR, THB, PHP, JPY, EUR, GBP, etc.). Map symbols (₫→VND, Rp→IDR, $→USD, S$→SGD, RM→MYR, ฿→THB, ₱→PHP, ¥→JPY, €→EUR, £→GBP).
- "amount" is the GRAND TOTAL across all items. For multi-row history images, sum every row.
- "items" lists every distinct transaction/line. Each item has a short "description" (merchant or trip route) and a numeric "amount".
- Do NOT include subtotals, taxes, tips, or running totals as separate items — only real transactions/products.
- "date" is ISO YYYY-MM-DD. If multiple dates appear, use the most recent transaction's date.
- Return numbers as plain numbers (no currency symbols, no thousands separators).
- If you cannot read the image, return amount: 0 and items: [].`

  const responseSchema = {
    type: "object",
    properties: {
      source: { type: "string" },
      date: { type: "string" },
      currency: { type: "string" },
      amount: { type: "number" },
      chargeType: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            amount: { type: "number" },
            date: { type: "string" },
          },
          required: ["description", "amount"],
        },
      },
    },
    required: ["amount", "items"],
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
          temperature: 0,
        },
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ??
    "{}"

  let parsed: {
    source?: string
    date?: string
    currency?: string
    amount?: number
    chargeType?: string
    items?: LineItem[]
  } = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("Gemini returned non-JSON response")
  }

  // If model returned items but the totals don't reconcile, prefer the sum.
  let amount = Number(parsed.amount) || 0
  const items = Array.isArray(parsed.items) ? parsed.items.filter((i) => i && typeof i.amount === "number" && i.amount > 0) : []
  if (items.length >= 2) {
    const sum = items.reduce((acc, it) => acc + (it.amount || 0), 0)
    if (sum > 0) amount = sum
  }

  return {
    source: parsed.source,
    date: parsed.date,
    currency: parsed.currency,
    amount,
    chargeType: parsed.chargeType ?? detectChargeType(`${parsed.source ?? ""} ${items.map((i) => i.description).join(" ")}`),
    items: items.length ? items : undefined,
    itemCount: items.length || undefined,
    rawText: text,
  }
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

  if (!await rateLimit(`ocr:${session.user.id}`, 10, 60000)) {
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

  const geminiApiKey = process.env.GEMINI_API_KEY
  const useGemini = geminiApiKey && geminiApiKey !== "placeholder"
  const googleApiKey = process.env.GOOGLE_VISION_API_KEY
  const useGoogle = googleApiKey && googleApiKey !== "placeholder"

  // Routing: Gemini (vision LLM, best for multi-transaction screenshots) →
  // Google Vision (classical OCR, good text extraction) → Tesseract (offline fallback).
  try {
    let result: ParsedReceipt
    if (useGemini) {
      try {
        result = await parseWithGemini(url, geminiApiKey)
      } catch (err) {
        console.error("Gemini OCR failed, falling back:", err)
        result = useGoogle
          ? await parseWithGoogleVision(url, googleApiKey)
          : await parseWithTesseract(url)
      }
    } else if (useGoogle) {
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
