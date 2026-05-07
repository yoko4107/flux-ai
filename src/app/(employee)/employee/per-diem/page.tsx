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
}

type PerDiemRequest = {
  id: string
  destinationCountry: string
  destinationCity: string | null
  isHighCost: boolean
  startDate: string
  endDate: string
  totalDays: number
  totalAmountUSD: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  reason: string | null
  rejectionReason: string | null
  supervisorNote: string | null
  createdAt: string
  days: {
    id: string
    date: string
    baseRateUSD: string
    isTravelDay: boolean
    breakfastProvided: boolean
    lunchProvided: boolean
    dinnerProvided: boolean
    dailyTotalUSD: string
  }[]
}

const STATUS_COLOR: Record<PerDiemRequest["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
}

// Mirrors lib/per-diem.ts so the live preview matches the server.
const MEAL = { breakfast: 0.15, lunch: 0.25, dinner: 0.40 }
function calcDay(rate: number, d: DayRow): number {
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
                <th className="px-5 py-2 text-right">Total (USD)</th>
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
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-900">${Number(r.totalAmountUSD).toFixed(2)}</td>
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
  if (entries.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Configured rates (USD/day)</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {entries.map(([cc, r]) => (
          <div key={cc} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="font-medium">{cc}</span>
            <span className="tabular-nums">
              ${r.standard.toFixed(2)}
              {r.highCost && <span className="ml-1 text-xs text-amber-700">/ ${r.highCost.toFixed(2)} high-cost</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
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

  const [country, setCountry] = useState(countries[0] ?? "")
  const [city, setCity] = useState("")
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState("")
  const [days, setDays] = useState<DayRow[]>([{ date: today, isTravelDay: true, breakfastProvided: false, lunchProvided: false, dinnerProvided: false }])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Resolve preview rate inline (matches server's rateForDestination).
  const previewRate = useMemo(() => {
    const entry = rates[country]
    if (!entry) return { rate: 0, isHighCost: false }
    if (city && entry.highCost && entry.highCostCities?.length) {
      const cityLc = city.trim().toLowerCase()
      const isHigh = entry.highCostCities.some((c) => cityLc.includes(c.toLowerCase()))
      if (isHigh) return { rate: entry.highCost, isHighCost: true }
    }
    return { rate: entry.standard, isHighCost: false }
  }, [country, city, rates])

  // Re-materialise the day grid whenever the date range changes. Preserves
  // user toggles for any dates that survive the new range.
  useEffect(() => {
    if (!startDate || !endDate || endDate < startDate) {
      setDays([])
      return
    }
    const newDays: DayRow[] = []
    const cur = new Date(startDate + "T00:00:00Z")
    const end = new Date(endDate + "T00:00:00Z")
    let i = 0
    while (cur <= end) {
      const dStr = cur.toISOString().slice(0, 10)
      const isFirst = newDays.length === 0
      // Defer "is last" until after the loop ends — set below.
      const existing = days.find((d) => d.date === dStr)
      newDays.push(existing
        ? { ...existing, isTravelDay: existing.isTravelDay }
        : {
            date: dStr,
            isTravelDay: isFirst, // first auto-flagged; last set after the loop
            breakfastProvided: false,
            lunchProvided: false,
            dinnerProvided: false,
          })
      cur.setUTCDate(cur.getUTCDate() + 1)
      i++
    }
    if (newDays.length >= 2) {
      // Always flag last as travel day too — user can untoggle if they
      // booked a red-eye that lands at 6am, etc.
      const last = newDays[newDays.length - 1]
      const existingLast = days.find((d) => d.date === last.date)
      last.isTravelDay = existingLast ? existingLast.isTravelDay : true
    }
    void i
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Destination country</span>
              <select required value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">— choose —</option>
                {countries.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">City (optional)</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Riyadh" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>

          {country && previewRate.rate > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Daily rate: <strong>${previewRate.rate.toFixed(2)}</strong>
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
                    <th className="px-3 py-2 text-right">Daily (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {days.map((d, idx) => (
                    <tr key={d.date}>
                      <td className="px-3 py-1.5 tabular-nums">{d.date}</td>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.isTravelDay} onChange={(e) => setDayField(idx, "isTravelDay", e.target.checked)} /></td>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.breakfastProvided} onChange={(e) => setDayField(idx, "breakfastProvided", e.target.checked)} /></td>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.lunchProvided} onChange={(e) => setDayField(idx, "lunchProvided", e.target.checked)} /></td>
                      <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={d.dinnerProvided} onChange={(e) => setDayField(idx, "dinnerProvided", e.target.checked)} /></td>
                      <td className="px-3 py-1.5 text-right tabular-nums">${calcDay(previewRate.rate, d).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900">${total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || previewRate.rate <= 0 || days.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit ${total.toFixed(2)}
          </button>
        </div>
      </form>
    </div>
  )
}
