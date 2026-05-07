"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Plane, X, AlertCircle } from "lucide-react"

// Employee per diem: submission form + history.
//
// The form's centerpiece is the "Meal Deductions" grid — one row per day,
// checkboxes for breakfast / lunch / dinner, plus a Travel-day flag. The
// client computes a live total preview using the same math the server
// uses (lib/per-diem.ts); the server re-runs the calc on submit so the
// stored total can't be fudged.

type Rate = { standard: number; highCost?: number; highCostCities?: string[] }
type RateTable = Record<string, Rate>

type DayRow = {
  date: string // YYYY-MM-DD
  // Amount the employee is claiming for this day, in the chosen currency.
  // Starts as null (blank input) — the user fills each day in. The
  // country's daily rate is shown in the form's rate-preview banner so
  // users have a reference, but no values are pre-populated. Submission
  // is blocked until every day has a number entered.
  amount: number | null
  isTravelDay: boolean
  breakfastProvided: boolean
  lunchProvided: boolean
  dinnerProvided: boolean
}

// Currencies the form lets you submit in. IDR is the default (org's
// payout currency); everything else is converted at submission via
// fx-rates with the chosen-currency total stored alongside the USD ref.
const CURRENCY_OPTIONS = ["IDR", "USD", "VND", "SGD", "MYR", "THB", "PHP", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "HKD", "KRW", "SAR", "AED", "TWD", "CHF", "CAD", "NZD"]

// Country code → primary local currency. Used by the rate-summary widget
// to display each configured per-diem rate in the destination's local
// currency (so admins set policy in USD, employees see what they'd earn
// in local terms).
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  VN: "VND", ID: "IDR", SA: "SAR", AE: "AED",
  SG: "SGD", MY: "MYR", TH: "THB", PH: "PHP",
  JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD",
  IN: "INR", AU: "AUD", NZ: "NZD",
  US: "USD", CA: "CAD", GB: "GBP",
  DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  IE: "EUR", PT: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK",
}

const ZERO_DECIMAL_CURRENCIES = new Set(["IDR", "VND", "JPY", "KRW"])

type PerDiemRequest = {
  id: string
  destinationCountry: string
  destinationCity: string | null
  isHighCost: boolean
  startDate: string
  endDate: string
  totalDays: number
  currency: string
  exchangeRate: string
  totalAmount: string
  totalAmountUSD: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  reason: string | null
  rejectionReason: string | null
  supervisorNote: string | null
  payoutCurrency: string | null
  payoutAccountHolder: string | null
  payoutAccountNumber: string | null
  payoutBankName: string | null
  payoutBankAddress: string | null
  payoutSwiftCode: string | null
  payoutRoutingNumber: string | null
  payoutNotes: string | null
  createdAt: string
  days: {
    id: string
    date: string
    baseRate: string
    baseRateUSD: string
    isTravelDay: boolean
    breakfastProvided: boolean
    lunchProvided: boolean
    dinnerProvided: boolean
    dailyTotal: string
    dailyTotalUSD: string
    isOverride: boolean
  }[]
}

interface PayoutOverride {
  payoutCurrency: string
  payoutAccountHolder: string
  payoutAccountNumber: string
  payoutBankName: string
  payoutBankAddress: string
  payoutSwiftCode: string
  payoutRoutingNumber: string
  payoutNotes: string
}
const EMPTY_PAYOUT: PayoutOverride = {
  payoutCurrency: "",
  payoutAccountHolder: "",
  payoutAccountNumber: "",
  payoutBankName: "",
  payoutBankAddress: "",
  payoutSwiftCode: "",
  payoutRoutingNumber: "",
  payoutNotes: "",
}

const STATUS_COLOR: Record<PerDiemRequest["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
}

// Locale guess for currency formatting. Used by formatLocal() to render
// "IDR 250.000" vs "USD 15.99" in the way the user expects for that
// currency's region.
//
// Arabic locales (ar-SA / ar-AE) default to Eastern-Arabic digits ٠١٢٣…
// which our finance users have explicitly asked us to avoid; we pin the
// `nu=latn` Unicode locale extension so the formatter keeps the locale's
// thousand-/decimal-separator conventions but renders 0-9 digits.
const CURRENCY_LOCALE: Record<string, string> = {
  IDR: "id-ID",
  VND: "vi-VN",
  JPY: "ja-JP",
  KRW: "ko-KR",
  CNY: "zh-CN",
  HKD: "zh-HK",
  TWD: "zh-TW",
  THB: "th-TH",
  PHP: "en-PH",
  MYR: "ms-MY",
  SGD: "en-SG",
  INR: "en-IN",
  USD: "en-US",
  CAD: "en-CA",
  GBP: "en-GB",
  AUD: "en-AU",
  NZD: "en-NZ",
  SAR: "ar-SA-u-nu-latn",
  AED: "ar-AE-u-nu-latn",
  EUR: "de-DE",
  CHF: "de-CH",
  SEK: "sv-SE",
  NOK: "nb-NO",
  DKK: "da-DK",
}

// ISO-3166 code → preferred display label. Defaults to the raw code
// (e.g. "VN", "ID") when not overridden.
const COUNTRY_LABEL: Record<string, string> = {
  SA: "KSA", // Kingdom of Saudi Arabia
}

export default function EmployeePerDiemPage() {
  const [rates, setRates] = useState<RateTable>({})
  const [requests, setRequests] = useState<PerDiemRequest[]>([])
  const [residenceCurrency, setResidenceCurrency] = useState("IDR")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const [r, list, profile] = await Promise.all([
      fetch("/api/per-diem/rates").then((res) => res.json()),
      fetch("/api/per-diem/request?scope=mine").then((res) => res.json()),
      fetch("/api/profile/preferences").then((res) => res.ok ? res.json() : null).catch(() => null),
    ])
    setRates(r.rates ?? {})
    setRequests(list.requests ?? [])
    const cur = profile?.profile?.defaultCurrency
    if (typeof cur === "string" && /^[A-Z]{3}$/.test(cur)) setResidenceCurrency(cur)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Per Diem</h1>
          <p className="text-sm text-gray-500 mt-1">
            Claim daily allowance for business travel. Rates are policy-set per country.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" /> New claim
        </button>
      </div>

      <RateSummary rates={rates} />

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">My claims</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        {requests.length === 0 && !loading ? (
          <div className="p-12 text-center">
            <Plane className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No per diem claims yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Submit your first claim
            </button>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2 text-left">Destination</th>
                <th className="px-5 py-2 text-left">Dates</th>
                <th className="px-5 py-2 text-right">Days</th>
                <th className="px-5 py-2 text-right">Total</th>
                <th className="px-5 py-2 text-left">Status</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-gray-900">
                    {r.destinationCity ? `${r.destinationCity}, ` : ""}{COUNTRY_LABEL[r.destinationCountry] ?? r.destinationCountry}
                    {r.isHighCost && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">High-cost</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{r.startDate.slice(0,10)} → {r.endDate.slice(0,10)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.totalDays}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                    {r.currency} {formatLocal(Number(r.totalAmount), r.currency)}
                    {/* USD reference only useful when the claim isn't in
                        the residence currency — drop it otherwise. */}
                    {r.currency !== "USD" && r.currency !== residenceCurrency && (
                      <div className="text-[10px] font-normal text-gray-500">≈ USD {Number(r.totalAmountUSD).toFixed(2)}</div>
                    )}
                    {(r.payoutCurrency || r.payoutAccountNumber || r.payoutSwiftCode) && (
                      <div className="mt-0.5 text-[10px] font-normal text-blue-700">
                        Wire to {r.payoutCurrency ?? r.currency}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[r.status]}`}>{r.status.toLowerCase()}</span>
                    {r.rejectionReason && <div className="mt-1 max-w-xs truncate text-xs text-gray-500" title={r.rejectionReason}>“{r.rejectionReason}”</div>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.status === "PENDING" && <CancelButton id={r.id} onDone={load} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <PerDiemForm
          rates={rates}
          onClose={() => setShowForm(false)}
          onSubmitted={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

function RateSummary({ rates }: { rates: RateTable }) {
  const entries = Object.entries(rates)
  // Keep the policy USD reference visible by hovering — but the headline
  // figure is the destination's local currency. We pull a USD→target rate
  // for each unique currency in parallel.
  const [fx, setFx] = useState<Record<string, number>>({})
  const [fxLoading, setFxLoading] = useState(false)

  useEffect(() => {
    if (entries.length === 0) return
    const uniqueCurrencies = Array.from(
      new Set(entries.map(([cc]) => COUNTRY_TO_CURRENCY[cc] ?? "USD"))
    )
    const toFetch = uniqueCurrencies.filter((c) => c !== "USD")
    if (toFetch.length === 0) return
    let cancelled = false
    setFxLoading(true)
    Promise.all(
      toFetch.map((c) =>
        fetch(`/api/fx/convert?from=USD&to=${c}&amount=1`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [c, d?.exchangeRate ? Number(d.exchangeRate) : 1] as const)
          .catch(() => [c, 1] as const)
      )
    )
      .then((pairs) => { if (!cancelled) setFx(Object.fromEntries(pairs)) })
      .finally(() => { if (!cancelled) setFxLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map(([cc]) => cc).join(",")])

  if (entries.length === 0) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Configured rates · daily {fxLoading && <span className="text-gray-400">(converting…)</span>}
      </h2>
      <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([cc, r]) => {
          const cur = COUNTRY_TO_CURRENCY[cc] ?? "USD"
          const rate = cur === "USD" ? 1 : (fx[cur] ?? 1)
          return (
            <div
              key={cc}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              title={`Policy: USD ${r.standard.toFixed(2)}${r.highCost ? ` / ${r.highCost.toFixed(2)} high-cost` : ""}`}
            >
              <span className="font-medium">{COUNTRY_LABEL[cc] ?? cc}</span>
              <span className="text-right tabular-nums">
                <div>{cur} {formatLocal(r.standard * rate, cur)}</div>
                {r.highCost && (
                  <div className="text-xs text-amber-700">
                    / {cur} {formatLocal(r.highCost * rate, cur)} high-cost
                  </div>
                )}
                {cur !== "USD" && (
                  <div className="text-[10px] font-normal text-gray-400">
                    USD {r.standard.toFixed(2)}{r.highCost ? ` / ${r.highCost.toFixed(2)}` : ""}
                  </div>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Locale-formatted display for a currency amount.
 *
 * Uses a per-currency locale (CURRENCY_LOCALE) so the thousands separator
 * matches what users from that region expect — "IDR 250.000" / "VND 250.000"
 * with dots, "USD 15.99" with a decimal point, "EUR 1.234,56" with the
 * European convention, etc.
 *
 * Zero-decimal currencies (IDR, VND, JPY, KRW) drop the cents.
 */
function formatLocal(amount: number, currency: string): string {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2
  return amount.toLocaleString(CURRENCY_LOCALE[currency] ?? undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function CancelButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  async function go() {
    if (!confirm("Cancel this claim?")) return
    setBusy(true)
    try {
      await fetch(`/api/per-diem/request/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      })
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {busy ? "…" : "Cancel"}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

function PerDiemForm({ rates, onClose, onSubmitted }: { rates: RateTable; onClose: () => void; onSubmitted: () => void }) {
  const countries = useMemo(() => Object.keys(rates).sort(), [rates])
  const today = new Date().toISOString().slice(0, 10)

  const initialCountry = countries[0] ?? ""
  const [country, setCountry] = useState(initialCountry)
  const [city, setCity] = useState("")
  // Default claim currency is IDR (the org's payout currency). The
  // destination is just where the trip is — payout stays in the home
  // currency unless the employee picks something else from the dropdown.
  const [currency, setCurrency] = useState("IDR")
  // Residence / payout currency comes from UserProfile.defaultCurrency
  // (falls back to Organization.baseCurrency, then "IDR"). Used to decide
  // whether to surface the USD reference on the rate preview / total.
  const [residenceCurrency, setResidenceCurrency] = useState("IDR")
  // Foreign-wire override section. Initially collapsed; once expanded, the
  // user can pick a different currency + supply bank details.
  const [wireOpen, setWireOpen] = useState(false)
  const [payout, setPayout] = useState<PayoutOverride>(EMPTY_PAYOUT)

  // Pull the residence currency once on mount.
  useEffect(() => {
    fetch("/api/profile/preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const cur = data?.profile?.defaultCurrency
        if (typeof cur === "string" && /^[A-Z]{3}$/.test(cur)) {
          setResidenceCurrency(cur)
          setCurrency(cur) // claim defaults to residence currency
        }
      })
      .catch(() => {})
  }, [])
  const [exchangeRate, setExchangeRate] = useState(1)
  const [fxLoading, setFxLoading] = useState(false)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState("")
  const [days, setDays] = useState<DayRow[]>([{ date: today, amount: null, isTravelDay: false, breakfastProvided: false, lunchProvided: false, dinnerProvided: false }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Pull the USD→target rate whenever the user changes currency. Fall back
  // to 1:1 on failure (the server will redo the conversion at submit anyway).
  useEffect(() => {
    if (currency === "USD") { setExchangeRate(1); return }
    let cancelled = false
    setFxLoading(true)
    fetch(`/api/fx/convert?from=USD&to=${currency}&amount=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data?.exchangeRate) setExchangeRate(Number(data.exchangeRate)) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFxLoading(false) })
    return () => { cancelled = true }
  }, [currency])

  // Resolve preview rate inline (matches server's rateForDestination).
  // Returns USD rate + isHighCost; we convert into chosen currency below.
  const previewRateUSD = useMemo(() => {
    const entry = rates[country]
    if (!entry) return { rate: 0, isHighCost: false }
    if (city && entry.highCost && entry.highCostCities?.length) {
      const cityLc = city.trim().toLowerCase()
      const isHigh = entry.highCostCities.some((c) => cityLc.includes(c.toLowerCase()))
      if (isHigh) return { rate: entry.highCost, isHighCost: true }
    }
    return { rate: entry.standard, isHighCost: false }
  }, [country, city, rates])

  // Rate displayed in the user's chosen currency.
  const previewRate = useMemo(
    () => ({
      rate: Math.round(previewRateUSD.rate * exchangeRate * 100) / 100,
      isHighCost: previewRateUSD.isHighCost,
    }),
    [previewRateUSD, exchangeRate]
  )

  // Re-materialise the day grid whenever the date range changes. Each new
  // day starts blank; surviving dates keep whatever amount the user typed.
  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setDays([])
      return
    }
    const newDays: DayRow[] = []
    const cur = new Date(startDate + "T00:00:00Z")
    const end = new Date(endDate + "T00:00:00Z")
    while (cur <= end) {
      const dStr = cur.toISOString().slice(0, 10)
      const existing = days.find((d) => d.date === dStr)
      newDays.push(existing ?? {
        date: dStr,
        amount: null,
        isTravelDay: false,
        breakfastProvided: false,
        lunchProvided: false,
        dinnerProvided: false,
      })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    setDays(newDays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  // Switching destination country / city / currency wipes any typed amounts
  // because "150,000" means something completely different across currencies.
  // Resetting to null forces the user to re-enter intentionally.
  useEffect(() => {
    setDays((prev) => prev.map((d) => ({ ...d, amount: null })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, city, currency])

  function setDayField<K extends keyof DayRow>(idx: number, key: K, value: DayRow[K]) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)))
  }

  // Each day's amount is whatever the user typed; nulls treat as 0 in
  // the running sum so the total updates as they fill in.
  const total = useMemo(
    () => Math.round(days.reduce((acc, d) => acc + (d.amount ?? 0), 0) * 100) / 100,
    [days]
  )

  // Submission is blocked until every day has a number entered (≥0 is fine —
  // a user might explicitly claim 0 for a fully-covered day).
  const allDaysFilled = days.length > 0 && days.every((d) => d.amount != null && d.amount >= 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!country) { setErr("Pick a destination"); return }
    if (previewRate.rate <= 0) { setErr(`No rate configured for ${country}`); return }
    setBusy(true); setErr(null)
    try {
      // Only send wire fields when the section is expanded — otherwise
      // we'd persist empty strings and clutter the audit display.
      const wireBody = wireOpen ? Object.fromEntries(
        Object.entries(payout).filter(([, v]) => v && String(v).trim() !== "")
      ) : {}
      const res = await fetch("/api/per-diem/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCountry: country,
          destinationCity: city || undefined,
          currency,
          startDate,
          endDate,
          reason: reason || undefined,
          ...wireBody,
          // Send each day with the typed amount as the override; legacy
          // travel-day / meal-deduction flags are always false in the new
          // simplified UI. Server stores amountOverride directly. The
          // `allDaysFilled` guard above means d.amount is a number here,
          // never null — fall back to 0 defensively for the type checker.
          days: days.map((d) => ({
            date: d.date,
            isTravelDay: false,
            breakfastProvided: false,
            lunchProvided: false,
            dinnerProvided: false,
            amountOverride: d.amount ?? 0,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed"); return }
      onSubmitted()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40">
      <form onSubmit={submit} className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <h2 className="font-semibold text-gray-900">New per diem claim</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Country</span>
              <select required value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">—</option>
                {countries.map((cc) => <option key={cc} value={cc}>{COUNTRY_LABEL[cc] ?? cc}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">City (optional)</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Riyadh" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {country && previewRate.rate > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Daily rate: <strong>{currency} {formatLocal(previewRate.rate, currency)}</strong>
              {/* USD reference is only useful when the claim isn't in the
                  residence currency (otherwise it's just noise). */}
              {currency !== "USD" && currency !== residenceCurrency && (
                <span className="ml-2 text-xs text-blue-700">
                  (USD {previewRateUSD.rate.toFixed(2)} × {exchangeRate.toFixed(4)}{fxLoading ? " …" : ""})
                </span>
              )}
              {previewRate.isHighCost && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">High-cost city</span>}
            </div>
          )}
          {country && previewRate.rate <= 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              No per diem rate configured for {country}. Ask an admin.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start date</span>
              <input required type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">End date</span>
              <input required type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reason / purpose (optional)</span>
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} placeholder="e.g. Q2 customer visits in Hanoi" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>

          {/* Foreign-wire payout override — only on per diem (other reimburse
              flows always pay in residence currency). Collapsed by default
              so most users don't see it; expand if you need a wire transfer
              to a foreign account. */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setWireOpen((v) => !v)}
              className="flex w-full items-center justify-between bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-100"
            >
              <span>
                Payout
                {wireOpen ? " — international wire transfer" : ` — default (${residenceCurrency} to your on-file account)`}
              </span>
              <span className="text-gray-400">{wireOpen ? "▾" : "▸"}</span>
            </button>
            {wireOpen && (
              <div className="space-y-3 border-t border-gray-200 p-4">
                <p className="text-xs text-gray-500">
                  Optional. Use this if you need finance to wire your per diem to a different bank account or in a different currency. Leave blank to receive payment in {residenceCurrency} to your on-file account.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Payout currency</span>
                    <select
                      value={payout.payoutCurrency}
                      onChange={(e) => setPayout((p) => ({ ...p, payoutCurrency: e.target.value }))}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">— same as claim ({currency}) —</option>
                      {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Account holder name</span>
                    <input value={payout.payoutAccountHolder} onChange={(e) => setPayout((p) => ({ ...p, payoutAccountHolder: e.target.value }))} maxLength={120} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Account number / IBAN</span>
                  <input value={payout.payoutAccountNumber} onChange={(e) => setPayout((p) => ({ ...p, payoutAccountNumber: e.target.value }))} maxLength={60} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Bank name</span>
                    <input value={payout.payoutBankName} onChange={(e) => setPayout((p) => ({ ...p, payoutBankName: e.target.value }))} maxLength={120} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">SWIFT / BIC code</span>
                    <input value={payout.payoutSwiftCode} onChange={(e) => setPayout((p) => ({ ...p, payoutSwiftCode: e.target.value.toUpperCase() }))} maxLength={20} placeholder="e.g. BMRIIDJA" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Bank address</span>
                  <input value={payout.payoutBankAddress} onChange={(e) => setPayout((p) => ({ ...p, payoutBankAddress: e.target.value }))} maxLength={300} placeholder="Often required for international wires" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Routing number / sort code / IFSC (optional)</span>
                  <input value={payout.payoutRoutingNumber} onChange={(e) => setPayout((p) => ({ ...p, payoutRoutingNumber: e.target.value }))} maxLength={40} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Notes for finance (optional)</span>
                  <textarea rows={2} value={payout.payoutNotes} onChange={(e) => setPayout((p) => ({ ...p, payoutNotes: e.target.value }))} maxLength={1000} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
            )}
          </div>

          {/* Per-day meal grid */}
          {days.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                Daily amounts ({days.length} {days.length === 1 ? "day" : "days"})
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Date</th>
                    <th className="px-4 py-2 text-right">Amount ({currency})</th>
                    <th className="px-4 py-2 text-right">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((d, idx) => (
                    <tr key={d.date}>
                      <td className="px-4 py-2 tabular-nums">{d.date}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100000000"
                          placeholder="0"
                          value={d.amount ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value
                            // Empty string → null (blank). Otherwise parse the number.
                            setDayField(idx, "amount", raw === "" ? null : Number(raw))
                          }}
                          className="w-36 rounded border border-gray-300 px-2 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                        {d.amount == null ? "—" : `${currency} ${formatLocal(d.amount, currency)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={2} className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-900">{currency} {formatLocal(total, currency)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                Enter the amount you're claiming for each day in {currency}. Reference: {currency} {formatLocal(previewRate.rate, currency)} / day for {COUNTRY_LABEL[country] ?? country}.
              </p>
            </div>
          )}

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button
            type="submit"
            disabled={busy || previewRate.rate <= 0 || days.length === 0 || !allDaysFilled}
            title={!allDaysFilled ? "Fill in an amount for every day before submitting" : ""}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit {currency} {formatLocal(total, currency)}
          </button>
        </div>
      </form>
    </div>
  )
}
