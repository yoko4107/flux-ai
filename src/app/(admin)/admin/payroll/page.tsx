"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, Plus, Save, Trash2, Sliders, FileText, Users as UsersIcon } from "lucide-react"

// Admin Payroll — Country rules editor.
// Tabs:
//  - Rules      : list and edit per-country payroll rules (this page)
//  - Employees  : compensation profiles + payslip generation (sibling page)
//  - Payslips   : full payslip list (sibling page)

type Component = {
  id: string
  code: string
  name: string
  type: string
  isTaxable: boolean
}

type Bracket = {
  minAmount: number
  maxAmount: number | null
  rate: number
}

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
}

type Rule = {
  id: string
  countryCode: string
  componentId: string
  component: Component
  costCenterId: string | null
  costCenter: { id: string; code: string; name: string; currency: string } | null
  enabled: boolean
  calculationType: "FIXED" | "PERCENT_BASE" | "PERCENT_GROSS" | "BRACKET" | "FORMULA"
  fixedAmount: string | null
  percentage: string | null
  formula: string | null
  minAmount: string | null
  maxAmount: string | null
  sortOrder: number
  brackets: Bracket[]
}

const CALC_TYPES = [
  { value: "FIXED", label: "Fixed amount" },
  { value: "PERCENT_BASE", label: "% of base salary" },
  { value: "PERCENT_GROSS", label: "% of gross pay" },
  { value: "BRACKET", label: "Bracketed (progressive)" },
  { value: "FORMULA", label: "Custom formula" },
] as const

export default function AdminPayrollRulesPage() {
  const [country, setCountry] = useState<string>("")
  // "" = all rules, "ORG" = org-wide fallback only, "<id>" = a specific CC
  const [scope, setScope] = useState<string>("")
  const [rules, setRules] = useState<Rule[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (country) qs.set("country", country)
      if (scope !== "") qs.set("costCenterId", scope) // "ORG" or "<id>"
      const [rRes, cRes] = await Promise.all([
        fetch(`/api/payroll/admin/rules?${qs}`),
        fetch("/api/payroll/components"),
      ])
      const r = await rRes.json()
      const c = await cRes.json()
      setRules(r.rules ?? [])
      setCostCenters(r.costCenters ?? [])
      if (!country && r.country) setCountry(r.country)
      setComponents(c.components ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, []) // initial
  useEffect(() => { if (country) load() }, [country, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveRule(rule: Rule) {
    setSaving(rule.id)
    try {
      const res = await fetch("/api/payroll/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: rule.countryCode,
          componentId: rule.componentId,
          costCenterId: rule.costCenterId,
          enabled: rule.enabled,
          calculationType: rule.calculationType,
          fixedAmount: rule.fixedAmount != null ? Number(rule.fixedAmount) : null,
          percentage: rule.percentage != null ? Number(rule.percentage) : null,
          formula: rule.formula ?? null,
          minAmount: rule.minAmount != null ? Number(rule.minAmount) : null,
          maxAmount: rule.maxAmount != null ? Number(rule.maxAmount) : null,
          sortOrder: rule.sortOrder,
          brackets: rule.calculationType === "BRACKET"
            ? rule.brackets.map((b) => ({ minAmount: b.minAmount, maxAmount: b.maxAmount, rate: b.rate }))
            : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Save failed")
      } else {
        await load()
      }
    } finally {
      setSaving(null)
    }
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`Delete the ${rule.component.name} rule for ${rule.countryCode}?`)) return
    const res = await fetch(`/api/payroll/admin/rules/${rule.id}`, { method: "DELETE" })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      alert(err?.error ?? "Delete failed")
    } else {
      load()
    }
  }

  function startAdd() { setAdding(true) }

  return (
    <div className="max-w-6xl space-y-5 p-1">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">Per-country payroll components, rates, and brackets.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/payroll/employees"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            <UsersIcon className="h-3.5 w-3.5" /> Employees
          </Link>
          <Link
            href="/admin/payroll/payslips"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            <FileText className="h-3.5 w-3.5" /> Payslips
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Sliders className="h-4 w-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Payroll rules</h2>
            <label className="text-xs text-gray-500 ml-3">
              Country
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="ID"
                className="ml-2 inline-block w-16 rounded border border-gray-300 px-2 py-1 font-mono text-xs uppercase"
              />
            </label>
            <label className="text-xs text-gray-500">
              Scope
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">All (per-CC + fallback)</option>
                <option value="ORG">Org-wide fallback only</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code} · {c.currency})</option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={startAdd}
            disabled={!country || country.length !== 2}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add component rule
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading rules…</div>
        ) : rules.length === 0 && !adding ? (
          <div className="p-12 text-center text-sm text-gray-500">
            No rules configured for <strong>{country || "this country"}</strong>. Click <strong>Add component rule</strong> to begin.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {adding && (
              <NewRuleRow
                country={country}
                components={components}
                // Only block components already configured for *this same scope* —
                // a component can have an org-wide rule AND a per-CC override.
                existing={rules.filter((r) => (r.costCenterId ?? "ORG") === (scope || "ORG")).map((r) => r.componentId)}
                scope={scope}
                costCenters={costCenters}
                onCancel={() => setAdding(false)}
                onSaved={() => { setAdding(false); load() }}
              />
            )}
            {rules.map((r) => (
              <RuleRow
                key={r.id}
                rule={r}
                saving={saving === r.id}
                onSave={(next) => saveRule(next)}
                onDelete={() => deleteRule(r)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RuleRow({
  rule,
  saving,
  onSave,
  onDelete,
}: {
  rule: Rule
  saving: boolean
  onSave: (r: Rule) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState<Rule>(rule)
  useEffect(() => setDraft(rule), [rule])

  const dirty = JSON.stringify(draft) !== JSON.stringify(rule)

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{rule.component.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{rule.component.code}</span>
            <TypeBadge type={rule.component.type} />
            {!rule.component.isTaxable && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">non-taxable</span>
            )}
            {rule.costCenter ? (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200">
                {rule.costCenter.name} · {rule.costCenter.currency}
              </span>
            ) : (
              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-gray-200">
                Org-wide fallback
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <button onClick={onDelete} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Delete rule">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Calculation</span>
          <select
            value={draft.calculationType}
            onChange={(e) => setDraft({ ...draft, calculationType: e.target.value as Rule["calculationType"] })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {CALC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>

        {(draft.calculationType === "FIXED") && (
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Amount</span>
            <input
              type="number" min={0} step={0.01}
              value={draft.fixedAmount ?? ""}
              onChange={(e) => setDraft({ ...draft, fixedAmount: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
        )}

        {(draft.calculationType === "PERCENT_BASE" || draft.calculationType === "PERCENT_GROSS") && (
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Rate (0–1)</span>
            <input
              type="number" min={0} max={1} step={0.0001}
              value={draft.percentage ?? ""}
              onChange={(e) => setDraft({ ...draft, percentage: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
              placeholder="0.05 = 5%"
            />
          </label>
        )}

        {draft.calculationType === "FORMULA" && (
          <label className="md:col-span-3 block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Formula</span>
            <input
              value={draft.formula ?? ""}
              onChange={(e) => setDraft({ ...draft, formula: e.target.value })}
              placeholder="base * 0.05 + 100000"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <span className="text-[10px] text-gray-500">Identifiers: base, gross, taxable, working, paid</span>
          </label>
        )}

        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Min amount</span>
          <input
            type="number" min={0} step={0.01}
            value={draft.minAmount ?? ""}
            onChange={(e) => setDraft({ ...draft, minAmount: e.target.value || null })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            placeholder="—"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Max amount</span>
          <input
            type="number" min={0} step={0.01}
            value={draft.maxAmount ?? ""}
            onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value || null })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            placeholder="—"
          />
        </label>
      </div>

      {draft.calculationType === "BRACKET" && (
        <BracketEditor
          brackets={draft.brackets}
          onChange={(b) => setDraft({ ...draft, brackets: b })}
        />
      )}

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
        <button
          onClick={() => onSave(draft)}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  )
}

function BracketEditor({ brackets, onChange }: { brackets: Bracket[]; onChange: (b: Bracket[]) => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Brackets (progressive)</span>
        <button
          type="button"
          onClick={() => onChange([...brackets, { minAmount: 0, maxAmount: null, rate: 0 }])}
          className="text-xs text-blue-700 hover:underline"
        >
          + Add bracket
        </button>
      </div>
      <div className="space-y-2">
        {brackets.map((b, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <span className="col-span-1 text-xs text-gray-500">#{i + 1}</span>
            <input
              type="number" min={0} step={0.01}
              value={b.minAmount}
              onChange={(e) => onChange(brackets.map((x, j) => j === i ? { ...x, minAmount: Number(e.target.value) } : x))}
              className="col-span-3 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
              placeholder="min"
            />
            <input
              type="number" min={0} step={0.01}
              value={b.maxAmount ?? ""}
              onChange={(e) => onChange(brackets.map((x, j) => j === i ? { ...x, maxAmount: e.target.value === "" ? null : Number(e.target.value) } : x))}
              className="col-span-3 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
              placeholder="max (∞)"
            />
            <input
              type="number" min={0} max={1} step={0.001}
              value={b.rate}
              onChange={(e) => onChange(brackets.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) } : x))}
              className="col-span-4 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums"
              placeholder="rate"
            />
            <button
              type="button"
              onClick={() => onChange(brackets.filter((_, j) => j !== i))}
              className="col-span-1 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {brackets.length === 0 && (
          <p className="text-xs text-gray-500">No brackets yet — add one to define the lowest tier.</p>
        )}
      </div>
    </div>
  )
}

function NewRuleRow({
  country,
  components,
  existing,
  scope,
  costCenters,
  onCancel,
  onSaved,
}: {
  country: string
  components: Component[]
  existing: string[]
  scope: string
  costCenters: CostCenter[]
  onCancel: () => void
  onSaved: () => void
}) {
  const available = components.filter((c) => !existing.includes(c.id))
  const [componentId, setComponentId] = useState<string>(available[0]?.id ?? "")
  const [calc, setCalc] = useState<Rule["calculationType"]>("FIXED")
  const [fixedAmount, setFixedAmount] = useState<string>("")
  const [percentage, setPercentage] = useState<string>("")
  // If admin is viewing "All", default the new rule to org-wide; otherwise
  // attach it to the scope they're filtered to (CC id or "ORG"/empty).
  const [targetCC, setTargetCC] = useState<string>(
    scope === "" ? "ORG" : scope
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!componentId) return
    setBusy(true)
    try {
      const res = await fetch("/api/payroll/admin/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: country,
          componentId,
          costCenterId: targetCC === "ORG" ? null : targetCC,
          enabled: true,
          calculationType: calc,
          fixedAmount: calc === "FIXED" && fixedAmount ? Number(fixedAmount) : null,
          percentage: (calc === "PERCENT_BASE" || calc === "PERCENT_GROSS") && percentage ? Number(percentage) : null,
          brackets: calc === "BRACKET" ? [{ minAmount: 0, maxAmount: null, rate: 0.1 }] : undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Failed to create rule")
      } else {
        onSaved()
      }
    } finally {
      setBusy(false)
    }
  }

  if (available.length === 0) {
    return (
      <div className="p-5 text-sm text-gray-500">
        All components have rules already.{" "}
        <button onClick={onCancel} className="text-blue-700 hover:underline">Cancel</button>
      </div>
    )
  }

  return (
    <div className="p-5 bg-amber-50/40">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Component</span>
          <select
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {available.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Applies to</span>
          <select
            value={targetCC}
            onChange={(e) => setTargetCC(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="ORG">Org-wide fallback (all employees)</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code} · {c.currency})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Calculation</span>
          <select
            value={calc}
            onChange={(e) => setCalc(e.target.value as Rule["calculationType"])}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {CALC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {calc === "FIXED" && (
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Amount</span>
            <input type="number" min={0} step={0.01} value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
          </label>
        )}
        {(calc === "PERCENT_BASE" || calc === "PERCENT_GROSS") && (
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Rate (0–1)</span>
            <input type="number" min={0} max={1} step={0.0001} value={percentage} onChange={(e) => setPercentage(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" placeholder="0.05" />
          </label>
        )}
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
        </button>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const palette: Record<string, string> = {
    EARNING: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    STATUTORY_DEDUCTION: "bg-rose-50 text-rose-700 ring-rose-200",
    VOLUNTARY_DEDUCTION: "bg-amber-50 text-amber-700 ring-amber-200",
    EMPLOYER_CONTRIBUTION: "bg-sky-50 text-sky-700 ring-sky-200",
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${palette[type] ?? "bg-gray-50 text-gray-700 ring-gray-200"}`}>
      {type.replace(/_/g, " ").toLowerCase()}
    </span>
  )
}
