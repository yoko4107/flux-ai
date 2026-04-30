// Shared helpers for pulling structured data out of raw OCR text.
// Used by both server-side Tesseract/Google Vision parsing and the
// browser Tesseract fallback so multi-item detection stays in one place.

export interface LineItem {
  description: string
  amount: number
}

// Currencies whose "decimals" are conventionally 0 when the amount uses
// a thousands separator like 29.120 → 29120.
const ZERO_DECIMAL_HINTS = /^(idr|vnd|jpy|krw)$/i

function parseNumericAmount(raw: string, currencyHint?: string): number {
  // Strip spaces
  const s = raw.replace(/\s/g, "")
  const hasDot = s.includes(".")
  const hasComma = s.includes(",")
  const lastDot = s.lastIndexOf(".")
  const lastComma = s.lastIndexOf(",")

  // Both separators present — the last one is the decimal separator.
  if (hasDot && hasComma) {
    if (lastComma > lastDot) {
      return parseFloat(s.replace(/\./g, "").replace(",", "."))
    }
    return parseFloat(s.replace(/,/g, ""))
  }
  // Only one kind of separator.
  const parts = s.split(/[.,]/)
  const zeroDecimal = currencyHint && ZERO_DECIMAL_HINTS.test(currencyHint)
  if (parts.length > 1 && parts[parts.length - 1].length === 3) {
    // Thousands separator: 29.120 or 29,120
    return parseInt(s.replace(/[.,]/g, ""), 10)
  }
  if (zeroDecimal && parts.length > 1) {
    // IDR/VND/JPY/KRW rarely use decimals; treat as thousands even when
    // grouping is irregular (e.g. "1.234" OCR'd as "1.234")
    return parseInt(s.replace(/[.,]/g, ""), 10)
  }
  return parseFloat(s.replace(/,/g, "."))
}

// Currency symbol / code → ISO-4217 code
const SYMBOL_MAP: Array<[RegExp, string]> = [
  [/₫|đ\b|VND\b/i, "VND"],
  [/\bRp\b|\bIDR\b/i, "IDR"],
  [/S\$|\bSGD\b/i, "SGD"],
  [/\bRM\b|\bMYR\b/i, "MYR"],
  [/\bUSD\b|(?<!S)\$/i, "USD"],
  [/€|\bEUR\b/i, "EUR"],
  [/£|\bGBP\b/i, "GBP"],
  [/¥|\bJPY\b|\bCNY\b/i, "JPY"],
  [/₹|\bINR\b/i, "INR"],
  [/₩|\bKRW\b/i, "KRW"],
  [/฿|\bTHB\b/i, "THB"],
  [/₱|\bPHP\b/i, "PHP"],
]

export function detectCurrency(text: string): string | undefined {
  for (const [re, code] of SYMBOL_MAP) {
    if (re.test(text)) return code
  }
  return undefined
}

// Matches an amount token optionally preceded or followed by a currency symbol.
// Captures the numeric raw string and (optionally) a currency marker on either side.
const LINE_AMOUNT_REGEX =
  /(Rp\.?|S\$|RM|\$|€|£|¥|₹|₩|฿|₱|USD|IDR|SGD|MYR|EUR|GBP|JPY|CNY|INR|KRW|THB|PHP|VND)?\s*([\d]{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*(₫|đ|Rp\.?|S\$|RM|\$|€|£|¥|₹|₩|฿|₱|USD|IDR|SGD|MYR|EUR|GBP|JPY|CNY|INR|KRW|THB|PHP|VND)?/i

const SUMMARY_LINE =
  /^(sub\s*total|subtotal|total|grand\s*total|amount\s*due|tax|vat|ppn|service|tip|gratuity|discount|change|cash|credit|paid|balance|due|fee)\b/i

export function extractLineItems(text: string, defaultCurrency?: string): LineItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const items: LineItem[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (SUMMARY_LINE.test(line)) continue

    const m = line.match(LINE_AMOUNT_REGEX)
    if (!m) continue

    const currencyHint = m[1] || m[3] || defaultCurrency
    const amount = parseNumericAmount(m[2], currencyHint)
    if (!isFinite(amount) || amount <= 0) continue

    // Require a currency indicator on the line itself OR a previously-seen
    // currency hint to avoid matching arbitrary numbers (phone, order id, etc).
    if (!m[1] && !m[3] && !defaultCurrency) continue

    let description = line
      .replace(m[0], "")
      .replace(/[•·|:\-]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
    if (description.length < 3 && i > 0) {
      const prev = lines[i - 1]
      if (!SUMMARY_LINE.test(prev) && !LINE_AMOUNT_REGEX.test(prev)) {
        description = prev
      }
    }
    if (!description) description = `Item ${items.length + 1}`

    items.push({ description, amount })
  }

  return items
}

export interface MultiItemResult {
  items: LineItem[]
  total: number
}

/**
 * Decide whether the OCR text looks like a multi-transaction list
 * (e.g. Grab activity history) rather than a single itemized receipt.
 *
 * Returns the summed items when multi-transaction, otherwise null.
 */
export function detectMultiTransaction(
  text: string,
  defaultCurrency?: string,
  singleTotal?: number
): MultiItemResult | null {
  const items = extractLineItems(text, defaultCurrency)
  if (items.length < 2) return null

  const sum = items.reduce((acc, it) => acc + it.amount, 0)

  // If a parsed "total" exists and matches the sum within 5%, it's a
  // single itemized receipt — don't treat as multi-transaction.
  if (singleTotal && singleTotal > 0) {
    const delta = Math.abs(singleTotal - sum) / singleTotal
    if (delta < 0.05) return null
    // If the singleTotal matches one of the items (and is the max), it's
    // just the total line — still multi-item if others remain.
  }

  return { items, total: sum }
}
