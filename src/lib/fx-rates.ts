/**
 * Foreign exchange rate service.
 * Fetches live rates and converts any currency to IDR.
 *
 * Uses the free exchangerate.host API (no key needed) with
 * frankfurter.app as fallback. Caches rates for 1 hour.
 */

interface RateCache {
  rates: Record<string, number> // currency code -> rate to IDR
  fetchedAt: number
}

let cache: RateCache | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Fetch current exchange rates to IDR.
 * Returns a map of currency code -> how many IDR per 1 unit.
 */
async function fetchRates(): Promise<Record<string, number>> {
  // Check cache first
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.rates
  }

  const rates: Record<string, number> = { IDR: 1 }

  // Try exchangerate.host (free, no API key)
  try {
    const res = await fetch(
      "https://api.exchangerate.host/latest?base=IDR",
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.rates && typeof data.rates === "object") {
        // data.rates = { USD: 0.0000625, ... } (1 IDR = X foreign currency)
        // We want: 1 USD = Y IDR, so invert
        for (const [code, rate] of Object.entries(data.rates)) {
          if (typeof rate === "number" && rate > 0) {
            rates[code] = 1 / rate
          }
        }
        cache = { rates, fetchedAt: Date.now() }
        return rates
      }
    }
  } catch {
    // fall through to next source
  }

  // Try frankfurter.app (free, no API key, ECB data)
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=USD",
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.rates?.IDR) {
        const usdToIdr = data.rates.IDR as number
        rates["USD"] = usdToIdr
        // Derive other rates via USD cross
        for (const [code, rateVsUsd] of Object.entries(data.rates)) {
          if (typeof rateVsUsd === "number" && rateVsUsd > 0) {
            rates[code] = usdToIdr / rateVsUsd
          }
        }
        cache = { rates, fetchedAt: Date.now() }
        return rates
      }
    }
  } catch {
    // fall through
  }

  // Last resort: hardcoded approximate rates (April 2026 estimates)
  const fallbackRates: Record<string, number> = {
    IDR: 1,
    USD: 16200,
    EUR: 17800,
    GBP: 20500,
    SGD: 12100,
    MYR: 3650,
    JPY: 108,
    CNY: 2230,
    AUD: 10500,
    CAD: 11800,
    CHF: 18100,
    HKD: 2080,
    KRW: 11.8,
    THB: 460,
    PHP: 285,
    INR: 193,
    VND: 0.65,
    TWD: 500,
    AED: 4410,
    SAR: 4320,
    NZD: 9800,
    SEK: 1560,
    NOK: 1500,
    DKK: 2380,
    BRL: 2850,
    MXN: 940,
    ZAR: 870,
    TRY: 470,
    PLN: 4150,
    CZK: 700,
    HUF: 44,
    RUB: 185,
    KWD: 52800,
    BHD: 43000,
    OMR: 42100,
    QAR: 4450,
    EGP: 330,
    PKR: 58,
    BDT: 147,
    LKR: 50,
    KES: 125,
    NGN: 10.5,
    GHS: 1080,
    ARS: 15,
    CLP: 17,
    COP: 3.8,
    PEN: 4350,
  }

  cache = { rates: fallbackRates, fetchedAt: Date.now() }
  return fallbackRates
}

/**
 * Convert an amount from any currency to IDR.
 * Returns { amountIDR, exchangeRate } or null if currency unknown.
 */
export async function convertToIDR(
  amount: number,
  currencyCode: string
): Promise<{ amountIDR: number; exchangeRate: number }> {
  if (currencyCode === "IDR") {
    return { amountIDR: amount, exchangeRate: 1 }
  }

  const rates = await fetchRates()
  const rate = rates[currencyCode]

  if (!rate) {
    // Unknown currency — use amount as-is with rate 1 (assume IDR)
    console.warn(`Unknown currency ${currencyCode}, treating as IDR`)
    return { amountIDR: amount, exchangeRate: 1 }
  }

  return {
    amountIDR: Math.round(amount * rate),
    exchangeRate: rate,
  }
}

/**
 * Get the current exchange rate for a currency to IDR.
 */
export async function getExchangeRate(currencyCode: string): Promise<number> {
  if (currencyCode === "IDR") return 1
  const rates = await fetchRates()
  return rates[currencyCode] ?? 1
}
