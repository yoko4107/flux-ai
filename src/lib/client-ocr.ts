"use client"

// Client-side OCR using Tesseract.js in the browser
// Much faster than server-side because:
// 1. No API round-trip
// 2. Uses WebAssembly SIMD in modern browsers
// 3. Language data cached in browser after first use

import type Tesseract from "tesseract.js"
import { detectMultiTransaction, type LineItem } from "@/lib/receipt-parser"

let workerPromise: Promise<Tesseract.Worker> | null = null

// Pre-warm the worker on first import
async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js")
      return createWorker("eng")
    })()
  }
  return workerPromise
}

// Pre-warm immediately
if (typeof window !== "undefined") {
  getWorker()
}

export interface OcrResult {
  date?: string
  amount?: number
  source?: string
  chargeType?: string
  currency?: string
  rawText?: string
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

function parseReceiptText(text: string): OcrResult {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean)
  const currentYear = new Date().getFullYear()

  // Date
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
    for (const pattern of [/\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/, /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/]) {
      const m = text.match(pattern)
      if (m) { const d = new Date(m[0]); if (!isNaN(d.getTime())) { date = d.toISOString().split("T")[0]; break } }
    }
  }

  // Amount — Rp format first
  let amount: number | undefined
  const rpMatch = text.match(/Rp\.?\s*([\d.]+)/i)
  if (rpMatch) amount = parseInt(rpMatch[1].replace(/\./g, ""), 10)
  if (amount === undefined) {
    for (const pattern of [/total[:\s]*(?:Rp\.?\s*)?\$?\s*([\d.,]+)/i, /amount[:\s]*\$?\s*([\d.,]+)/i]) {
      const m = text.match(pattern)
      if (m) {
        const raw = m[1]
        const dotParts = raw.split(".")
        amount = (dotParts.length > 1 && dotParts[dotParts.length - 1].length === 3)
          ? parseInt(raw.replace(/\./g, ""), 10)
          : parseFloat(raw.replace(",", ""))
        break
      }
    }
  }

  // Currency
  let currency: string | undefined
  if (text.match(/Rp|IDR/i)) currency = "IDR"
  else if (text.match(/\$|USD/)) currency = "USD"
  else if (text.match(/€|EUR/)) currency = "EUR"
  else if (text.match(/£|GBP/)) currency = "GBP"
  else if (text.match(/S\$|SGD/)) currency = "SGD"
  else if (text.match(/RM|MYR/)) currency = "MYR"

  // Source
  let source: string | undefined
  for (const line of lines) {
    if (line.length < 3 || line.match(/^[^a-zA-Z]*$/) || line.match(/^[=\-_*#]+$/)) continue
    source = line; break
  }

  const multi = detectMultiTransaction(text, currency, amount)
  if (multi) amount = multi.total

  return {
    date,
    amount,
    source,
    chargeType: detectChargeType(text),
    currency,
    rawText: text,
    items: multi?.items,
    itemCount: multi?.items.length,
  }
}

/**
 * Run OCR on a File object directly in the browser.
 * Returns parsed receipt data in < 3 seconds.
 */
export async function runClientOCR(file: File): Promise<OcrResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(file)
  return parseReceiptText(data.text)
}
