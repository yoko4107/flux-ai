/**
 * Foreign exchange rate service.
 * Fetches live rates and converts any currency pair.
 *
 * Source chain (first success wins):
 *   1. open.er-api.com   — free, no key, 160+ currencies, USD base
 *   2. fawazahmed0 CDN   — free, no key, 170+ currencies including VND/SAR/AED
 *   3. frankfurter.app   — free, ECB data, ~30 major currencies
 *   4. Hardcoded fallback — used only when all live feeds fail
 *
 * Rates are cached in process memory for 1 hour.
 */

interface RateCache {
  rates: Record<string, number> // currency code -> IDR per 1 unit
  fetchedAt: number
}

let cache: RateCache | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

// Baseline rates (May 2026) used only when all live feeds are unreachable.
// Live rates from the API sources overlay these on each successful fetch.
const FALLBACK_RATES: Record<string, number> = {
  IDR: 1,
  USD: 17556,
  EUR: 19197,
  GBP: 23297,
  SGD: 13710,
  MYR: 4031,
  JPY: 120,
  CNY: 2421,
  AUD: 11311,
  CAD: 12701,
  CHF: 20880,
  HKD: 2261,
  KRW: 12.64,
  THB: 527,
  PHP: 312,
  INR: 207,
  VND: 0.67,
  TWD: 551,
  AED: 4780,
  SAR: 4682,
  NZD: 10366,
  SEK: 1731,
  NOK: 1677,
  DKK: 2573,
  BRL: 3097,
  MXN: 902,
  ZAR: 959,
  TRY: 454,
  PLN: 4566,
  CZK: 762,
  HUF: 48.7,
  KWD: 57100,
  BHD: 46600,
  OMR: 45600,
  QAR: 4822,
  EGP: 358,
  PKR: 62,
  BDT: 159,
  LKR: 54,
  KES: 136,
  NGN: 11.4,
  GHS: 1170,
  ARS: 16,
  CLP: 18.5,
  COP: 4.1,
  PEN: 4716,
}

/**
 * Fetch current exchange rates, returning IDR per 1 unit of each currency.
 * Returns a map merged from live data over the hardcoded fallback baseline.
 */
async function fetchRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.rates
  }

  const rates: Record<string, number> = { ...FALLBACK_RATES }

  // Source 1: open.er-api.com — free, no key, USD-base, 160+ currencies
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/USD",
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      if (data.result === "success" && data.rates && typeof data.rates === "object") {
        // rates[code] = 1 USD = X units. IDR per unit = rates.IDR / rates[code].
        const usdToIdr = Number(data.rates["IDR"])
        if (usdToIdr > 0) {
          for (const [code, usdRate] of Object.entries(data.rates)) {
            if (typeof usdRate === "number" && usdRate > 0) {
              rates[code] = usdToIdr / usdRate
            }
          }
          rates["IDR"] = 1
          cache = { rates, fetchedAt: Date.now() }
          return rates
        }
      }
    }
  } catch {
    // fall through
  }

  // Source 2: fawazahmed0 CDN — free, no key, 170+ currencies, covers VND/SAR/AED
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      { signal: AbortSignal.timeout(6000) }
    )
    if (res.ok) {
      const data = await res.json()
      const usdRates = data?.usd
      if (usdRates && typeof usdRates === "object") {
        const usdToIdr = Number(usdRates["idr"])
        if (usdToIdr > 0) {
          for (const [code, usdRate] of Object.entries(usdRates)) {
            if (typeof usdRate === "number" && usdRate > 0) {
              rates[code.toUpperCase()] = usdToIdr / usdRate
            }
          }
          rates["IDR"] = 1
          cache = { rates, fetchedAt: Date.now() }
          return rates
        }
      }
    }
  } catch {
    // fall through
  }

  // Source 3: frankfurter.app — ECB data, ~30 major currencies, no VND/SAR/AED
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
        for (const [code, rateVsUsd] of Object.entries(data.rates)) {
          if (typeof rateVsUsd === "number" && rateVsUsd > 0) {
            rates[code] = usdToIdr / rateVsUsd
          }
        }
        rates["IDR"] = 1
        cache = { rates, fetchedAt: Date.now() }
        return rates
      }
    }
  } catch {
    // fall through
  }

  // All live feeds failed — return hardcoded fallback rates.
  cache = { rates, fetchedAt: Date.now() }
  return rates
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

/**
 * Convert an amount from one currency to another. Rates are stored as
 * "units of IDR per 1 unit of currency", so we cross through IDR.
 *
 * Returns { amountBase, exchangeRate } where exchangeRate is the rate
 * used to convert 1 unit of `from` into `to` (i.e. amountBase = amount * rate).
 */
export async function convert(
  amount: number,
  from: string,
  to: string
): Promise<{ amountBase: number; exchangeRate: number }> {
  if (from === to) return { amountBase: amount, exchangeRate: 1 }
  const rates = await fetchRates()
  const fromToIDR = from === "IDR" ? 1 : rates[from]
  const toToIDR = to === "IDR" ? 1 : rates[to]
  if (!fromToIDR || !toToIDR) {
    console.warn(`Unknown currency in conversion ${from}->${to}, treating as 1:1`)
    return { amountBase: amount, exchangeRate: 1 }
  }
  const rate = fromToIDR / toToIDR // 1 `from` = rate `to`
  // Use 0 decimals for zero-decimal currencies (IDR, VND, JPY, KRW)
  const decimals = to === "IDR" || to === "JPY" || to === "VND" || to === "KRW" ? 0 : 2
  const factor = Math.pow(10, decimals)
  return {
    amountBase: Math.round(amount * rate * factor) / factor,
    exchangeRate: Number(rate.toFixed(6)),
  }
}
