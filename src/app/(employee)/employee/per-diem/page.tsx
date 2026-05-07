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
  isTravelDay: boolean
  breakfastProvided: boolean
  lunchProvided: boolean
  dinnerProvided: boolean
  // Manual override of the day's amount in the chosen currency. null
  // means "use the calculated value"; a number replaces the formula
  // result for that day.
  amountOverride: number | null
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

const STATUS_COLOR: Record<PerDiemRequest["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
}

// Mirrors lib/per-diem.ts so the live preview matches the server.
// Override (when non-null) bypasses the formula entirely.
const MEAL = { breakfast: 0.15, lunch: 0.25, dinner: 0.40 }
function calcDay(rate: number, d: DayRow): number {
  if (d.amountOverride != null && d.amountOverride >= 0) {
    return Math.round(d.amountOverride * 100) / 100
  }
  const scaled = rate * (d.isTravelDay ? 0.75 : 1.0)
  const ded = (d.breakfastProvided ? rate * MEAL.breakfast : 0)
    + (d.lunchProvided ? rate * MEAL.lunch : 0)
    + (d.dinnerProvided ? rate * MEAL.dinner : 0)
  return Math.max(0, Math.round((scaled - ded) * 100) / 100)
}

export default function EmployeePerDiemPage() {
  const [rates, setRates] = useState<RateTable>({})
  const [requests, setRequests] = useState<PerDiemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const [r, list] = await Promise.all([
      fetch("/api/per-diem/rates").then((res) => res.json()),
      fetch("/api/per-diem/request?scope=mine").then((res) => res.json()),
    ])
    setRates(r.rates ?? {})
    setRequests(list.requests ?? [])
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
                    {r.destinationCity ? `${r.destinationCity}, ` : ""}{r.destinationCountry}
                    {r.isHighCost && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">High-cost</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{r.startDate.slice(0,10)} → {r.endDate.slice(0,10)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.totalDays}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">
                    {r.currency} {Number(r.totalAmount).toFixed(2)}
                    {r.currency !== "USD" && (
                      <div className="text-[10px] font-normal text-gray-500">≈ USD {Number(r.totalAmountUSD).toFixed(2)}</div>
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
              <span className="font-medium">{cc}</span>
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

/** Locale-formatted display for a currency amount. Zero-decimal currencies
 *  (IDR, VND, JPY, KRW) drop the cents to look natural. */
function formatLocal(amount: number, currency: string): string {
  const decimals = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2
  return amount.toLocaleString(undefined, {
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
  const [exchangeRate, setExchangeRate] = useState(1)
  const [fxLoading, setFxLoading] = useState(false)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState("")
  const [days, setDays] = useState<DayRow[]>([{ date: today, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false, amountOverride: null }])
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

  // Re-materialise the day grid whenever the date range changes. Preserves
  // user toggles + per-day overrides for any dates that survive the new range.
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
      const isFirst = newDays.length === 0
      const existing = days.find((d) => d.date === dStr)
      newDays.push(existing ?? {
        date: dStr,
        isTravelDay: isFirst, // first auto-flagged; last patched below
        breakfastProvided: false,
        lunchProvided: false,
        dinnerProvided: false,
        amountOverride: null,
      })
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    if (newDays.length >= 2) {
      const last = newDays[newDays.length - 1]
      const existingLast = days.find((d) => d.date === last.date)
      last.isTravelDay = existingLast ? existingLast.isTravelDay : true
    }
    setDays(newDays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  function setDayField<K extends keyof DayRow>(idx: number, key: K, value: DayRow[K]) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, [key]: value } : d)))
  }

  const total = useMemo(
    () => Math.round(days.reduce((acc, d) => acc + calcDay(previewRate.rate, d), 0) * 100) / 100,
    [days, previewRate.rate]
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!country) { setErr("Pick a destination"); return }
    if (previewRate.rate <= 0) { setErr(`No rate configured for ${country}`); return }
    setBusy(true); setErr(null)
    try {
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
          days,
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
                {countries.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
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
              Daily rate: <strong>{currency} {previewRate.rate.toFixed(2)}</strong>
              {currency !== "USD" && (
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

          {/* Per-day meal grid */}
          {days.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                Meal deductions ({days.length} {days.length === 1 ? "day" : "days"})
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-center">Travel day<br/><span className="text-[9px] font-normal">(75%)</span></th>
                    <th className="px-3 py-2 text-center">Breakfast<br/><span className="text-[9px] font-normal">(−15%)</span></th>
                    <th className="px-3 py-2 text-center">Lunch<br/><span className="text-[9px] font-normal">(−25%)</span></th>
                    <th className="px-3 py-2 text-center">Dinner<br/><span className="text-[9px] font-normal">(−40%)</span></th>
                    <th className="px-3 py-2 text-right">Daily ({currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((d, idx) => {
                    const computed = calcDay(previewRate.rate, { ...d, amountOverride: null })
                    const shown = d.amountOverride != null ? d.amountOverride : computed
                    const isOverride = d.amountOverride != null
                    return (
                      <tr key={d.date}>
                        <td className="px-3 py-1.5 tabular-nums">{d.date}</td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.isTravelDay} onChange={(e) => setDayField(idx, "isTravelDay", e.target.checked)} /></td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.breakfastProvided} disabled={isOverride} onChange={(e) => setDayField(idx, "breakfastProvided", e.target.checked)} /></td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.lunchProvided} disabled={isOverride} onChange={(e) => setDayField(idx, "lunchProvided", e.target.checked)} /></td>
                        <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.dinnerProvided} disabled={isOverride} onChange={(e) => setDayField(idx, "dinnerProvided", e.target.checked)} /></td>
                        <td className="px-3 py-1.5 text-right">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number" step="0.01" min="0" max="10000"
                              value={shown.toFixed(2)}
                              onChange={(e) => setDayField(idx, "amountOverride", Number(e.target.value))}
                              className={`w-24 rounded border px-2 py-1 text-right text-sm tabular-nums ${
                                isOverride ? "border-amber-300 bg-amber-50" : "border-gray-200"
                              }`}
                              title={isOverride ? `Manual override (calculated would be ${currency} ${computed.toFixed(2)})` : ""}
                            />
                            {isOverride && (
                              <button
                                type="button"
                                onClick={() => setDayField(idx, "amountOverride", null)}
                                className="rounded text-[10px] text-blue-600 hover:underline"
                                title="Reset to calculated value"
                              >
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">{currency} {total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="border-t border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                Edit any daily amount directly to override the formula for that day. Click ↺ to revert.
              </p>
            </div>
          )}

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || previewRate.rate <= 0 || days.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit {currency} {total.toFixed(2)}
          </button>
        </div>
      </form>
    </div>
  )
}
