"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, RotateCcw, CheckCircle2 } from "lucide-react"

// Admin per-diem rate configuration.
//   - Per-region: pick a cost center (or org-wide) to edit its rate sheet.
//   - Standard daily rate per country, optional high-cost tier with city
//     allowlist (case-insensitive substring on destinationCity).
//   - Reset reverts the active bucket to defaults / parent layer.
//
// All amounts in USD per the spec.

type Rate = {
  standard: number
  highCost?: number
  highCostCities?: string[]
}
type RateTable = Record<string, Rate>
type CostCenter = { id: string; code: string; name: string; currency: string; countryCode: string }

export default function AdminPerDiemPage() {
  const [rates, setRates] = useState<RateTable>({})
  const [isOverride, setIsOverride] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  // "" = org-wide bucket, "<id>" = a specific cost center.
  const [scope, setScope] = useState<string>("")
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])

  async function load() {
    const qs = scope ? `?costCenterId=${scope}` : ""
    const data = await fetch(`/api/per-diem/admin/rates${qs}`).then((r) => r.json())
    setRates(data.rates ?? {})
    setIsOverride(!!data.isOverride)
    setCostCenters(data.costCenters ?? [])
  }
  useEffect(() => { load() }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  function setCountry(cc: string, rate: Rate) {
    setRates((prev) => ({ ...prev, [cc]: rate }))
  }
  function removeCountry(cc: string) {
    setRates((prev) => {
      const next = { ...prev }
      delete next[cc]
      return next
    })
  }
  function addCountry() {
    const cc = (prompt("Country ISO-2 code (e.g. JP, MY, TH):") || "").trim().toUpperCase()
    if (!cc.match(/^[A-Z]{2}$/)) {
      if (cc) alert("Code must be 2 uppercase letters (ISO-3166-1 alpha-2).")
      return
    }
    if (rates[cc]) {
      alert(`${cc} already exists — edit it directly.`)
      return
    }
    setCountry(cc, { standard: 100 })
  }

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const res = await fetch("/api/per-diem/admin/rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates, costCenterId: scope || null }),
      })
      if (res.ok) { setSaved(true); load() }
    } finally { setBusy(false); setTimeout(() => setSaved(false), 2500) }
  }

  async function reset() {
    const target = scope
      ? costCenters.find((c) => c.id === scope)?.name ?? "this cost center"
      : "the org-wide bucket"
    if (!confirm(`Remove the override for ${target}? Rates fall back to the parent layer / built-in defaults.`)) return
    setBusy(true)
    try {
      const qs = scope ? `?costCenterId=${scope}` : ""
      await fetch(`/api/per-diem/admin/rates${qs}`, { method: "DELETE" })
      load()
    } finally { setBusy(false) }
  }

  const entries = Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="max-w-3xl space-y-4 p-1">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Per Diem — Admin</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Set the daily rate per country. All amounts in USD. Each regional cost center
            can layer its own overrides on top of the org-wide bucket — useful when, say,
            your Vietnam office reimburses Japan trips differently than the Indonesia office.
          </p>
        </div>
        <span className={`text-xs ${isOverride ? "text-blue-700" : "text-gray-500"}`}>
          {isOverride ? "Custom override" : "Inherited from parent layer / defaults"}
        </span>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-900">Country rates</h2>
            <label className="text-xs text-gray-500">
              Scope
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">Org-wide bucket</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </label>
          </div>
          <button onClick={addCountry} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            <Plus className="h-3.5 w-3.5" /> Add country
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No rates configured. Click <strong>Add country</strong> to start.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map(([cc, r]) => (
              <CountryRow
                key={cc}
                code={cc}
                rate={r}
                onChange={(next) => setCountry(cc, next)}
                onRemove={() => removeCountry(cc)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save rates
        </button>
        {isOverride && (
          <button onClick={reset} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </button>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

function CountryRow({ code, rate, onChange, onRemove }: { code: string; rate: Rate; onChange: (r: Rate) => void; onRemove: () => void }) {
  const [hasHighCost, setHasHighCost] = useState(typeof rate.highCost === "number")
  return (
    <div className="grid gap-3 px-5 py-3 md:grid-cols-12 items-start">
      <div className="md:col-span-1 font-mono text-sm font-semibold text-gray-900 mt-2">{code}</div>
      <label className="md:col-span-3 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Standard / day (USD)</span>
        <input
          type="number" min={0} max={2000} step={1}
          value={rate.standard}
          onChange={(e) => onChange({ ...rate, standard: Number(e.target.value) })}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
        />
      </label>
      <label className="md:col-span-3 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          High-cost rate (USD)
          <input type="checkbox" checked={hasHighCost} onChange={(e) => {
            setHasHighCost(e.target.checked)
            if (!e.target.checked) {
              const { highCost: _h, highCostCities: _c, ...rest } = rate
              void _h; void _c
              onChange(rest)
            } else {
              onChange({ ...rate, highCost: rate.highCost ?? rate.standard, highCostCities: rate.highCostCities ?? [] })
            }
          }} className="ml-2 align-middle" />
        </span>
        <input
          type="number" min={0} max={2000} step={1} disabled={!hasHighCost}
          value={rate.highCost ?? ""}
          onChange={(e) => onChange({ ...rate, highCost: Number(e.target.value) })}
          placeholder="—"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums disabled:bg-gray-50"
        />
      </label>
      <label className="md:col-span-4 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">High-cost cities (comma-separated)</span>
        <input
          disabled={!hasHighCost}
          value={(rate.highCostCities ?? []).join(", ")}
          onChange={(e) => onChange({ ...rate, highCostCities: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="Riyadh, Jeddah"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />
      </label>
      <div className="md:col-span-1 flex justify-end mt-1">
        <button type="button" onClick={onRemove} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Remove country">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
