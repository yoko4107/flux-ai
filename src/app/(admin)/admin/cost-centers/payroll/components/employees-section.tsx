"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
  Loader2, Search, Trash2, ChevronDown, ChevronRight,
  Save, Calculator, FilePlus2,
} from "lucide-react"

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

type User = {
  id: string
  name: string | null
  email: string
  role: string
  status: "ACTIVE" | "INACTIVE" | "PENDING"
  department: string | null
}

type Compensation = {
  baseSalary: string
  currency: string
  workingDaysPerMonth: number
  startedAt: string
  endedAt: string | null
  componentOverrides: Record<string, number> | null
}

type CalcPreview = {
  grossPay: number
  taxableIncome: number
  totalDeductions: number
  netPay: number
  employerCost: number
  lines: { componentCode: string; componentName: string; type: string; amount: number; sortOrder: number }[]
}

const STATUS_CLASSES = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  PENDING: "bg-yellow-100 text-yellow-700",
}

export function EmployeesSection({ costCenter }: { costCenter: CostCenter }) {
  const [employees, setEmployees] = useState<User[]>([])
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users?costCenterId=${costCenter.id}`)
      const data = await res.json()
      setEmployees(Array.isArray(data) ? data : (data.users ?? []))
    } finally {
      setLoading(false)
    }
  }, [costCenter.id])

  useEffect(() => { load() }, [load])

  const filtered = employees.filter((u) =>
    (u.name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    u.email.toLowerCase().includes(filter.toLowerCase())
  )

  async function deleteEmployee(u: User) {
    if (!confirm(`Delete ${u.name ?? u.email}? This cannot be undone.`)) return
    setDeleting(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Delete failed")
      } else {
        if (expanded === u.id) setExpanded(null)
        await load()
      }
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        <p>No employees assigned to this cost center yet.</p>
        <Link href="/admin/cost-centers" className="mt-2 inline-block text-blue-700 hover:underline">
          Manage cost center assignments
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
        <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or email…"
          className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        <span className="text-xs text-gray-400">{filtered.length} employees</span>
      </div>

      {/* Employee list */}
      <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No employees match.</div>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id}>
              {/* Row */}
              <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50/60">
                <button
                  onClick={() => setExpanded((prev) => (prev === emp.id ? null : emp.id))}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  {expanded === emp.id
                    ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.name ?? "—"}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {emp.email}{emp.department ? ` · ${emp.department}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASSES[emp.status] ?? STATUS_CLASSES.PENDING}`}>
                    {emp.status.charAt(0) + emp.status.slice(1).toLowerCase()}
                  </span>
                </button>
                <button
                  onClick={() => deleteEmployee(emp)}
                  disabled={deleting === emp.id}
                  className="shrink-0 rounded p-1.5 text-red-400 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                  title="Delete employee"
                >
                  {deleting === emp.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />
                  }
                </button>
              </div>

              {/* Inline payroll panel */}
              {expanded === emp.id && (
                <div className="border-t border-blue-100 bg-blue-50/30 px-4 py-4">
                  <PayrollPanel user={emp} costCenter={costCenter} />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function PayrollPanel({ user, costCenter }: { user: User; costCenter: CostCenter }) {
  const [comp, setComp] = useState<Compensation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [paidDays, setPaidDays] = useState("")
  const [workingDays, setWorkingDays] = useState("")
  const [preview, setPreview] = useState<CalcPreview | null>(null)
  const [busy, setBusy] = useState<null | "preview" | "generate">(null)
  const [genResult, setGenResult] = useState<{ id: string; period: string } | null>(null)
  const [tab, setTab] = useState<"comp" | "payslip">("comp")

  useEffect(() => {
    setLoading(true)
    fetch(`/api/payroll/admin/compensation/${user.id}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.compensation) {
          const c = r.compensation
          setComp({
            baseSalary: c.baseSalary?.toString() ?? "0",
            currency: c.currency ?? costCenter.currency,
            workingDaysPerMonth: c.workingDaysPerMonth ?? 22,
            startedAt: (c.startedAt ?? new Date().toISOString()).slice(0, 10),
            endedAt: c.endedAt ? c.endedAt.slice(0, 10) : null,
            componentOverrides: c.componentOverrides ?? null,
          })
        } else {
          setComp({
            baseSalary: "0",
            currency: costCenter.currency,
            workingDaysPerMonth: 22,
            startedAt: new Date().toISOString().slice(0, 10),
            endedAt: null,
            componentOverrides: null,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [user.id, costCenter.currency])

  async function saveComp() {
    if (!comp) return
    setSaving(true)
    try {
      const res = await fetch(`/api/payroll/admin/compensation/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: Number(comp.baseSalary),
          currency: comp.currency.toUpperCase(),
          workingDaysPerMonth: comp.workingDaysPerMonth,
          startedAt: comp.startedAt,
          endedAt: comp.endedAt,
          componentOverrides: comp.componentOverrides ?? undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Save failed")
      }
    } finally {
      setSaving(false)
    }
  }

  async function runPreview() {
    setBusy("preview"); setPreview(null)
    try {
      const res = await fetch("/api/payroll/admin/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: user.id,
          period,
          paidDays: paidDays === "" ? undefined : Number(paidDays),
          workingDays: workingDays === "" ? undefined : Number(workingDays),
        }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Preview failed"); return }
      setPreview(j.preview)
    } finally { setBusy(null) }
  }

  async function generate() {
    setBusy("generate"); setGenResult(null)
    try {
      const res = await fetch("/api/payroll/admin/payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: user.id,
          period,
          paidDays: paidDays === "" ? undefined : Number(paidDays),
          workingDays: workingDays === "" ? undefined : Number(workingDays),
        }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Generate failed"); return }
      setGenResult({ id: j.payslip.id, period: j.payslip.period })
    } finally { setBusy(null) }
  }

  if (loading || !comp) {
    return (
      <div className="py-6 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" /> Loading payroll…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex items-center gap-4 border-b border-blue-200/60">
        {(["comp", "payslip"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 text-xs font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "comp" ? "Compensation profile" : "Generate payslip"}
          </button>
        ))}
      </div>

      {tab === "comp" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Base salary / mo</span>
              <input
                type="number" min={0} step={1}
                value={comp.baseSalary}
                onChange={(e) => setComp({ ...comp, baseSalary: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Currency</span>
              <input
                value={comp.currency}
                maxLength={3}
                onChange={(e) => setComp({ ...comp, currency: e.target.value.toUpperCase() })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 font-mono text-sm uppercase"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Working days</span>
              <input
                type="number" min={1} max={31}
                value={comp.workingDaysPerMonth}
                onChange={(e) => setComp({ ...comp, workingDaysPerMonth: Number(e.target.value) })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Started at</span>
              <input
                type="date"
                value={comp.startedAt}
                onChange={(e) => setComp({ ...comp, startedAt: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Ended at</span>
              <input
                type="date"
                value={comp.endedAt ?? ""}
                onChange={(e) => setComp({ ...comp, endedAt: e.target.value || null })}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          {/* Component overrides */}
          <ComponentOverrides
            overrides={comp.componentOverrides}
            onChange={(o) => setComp({ ...comp, componentOverrides: o })}
          />

          <div className="flex justify-end">
            <button
              onClick={saveComp}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save compensation
            </button>
          </div>
        </div>
      )}

      {tab === "payslip" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Period</span>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1 block rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Working days override</span>
              <input
                type="number" min={1} max={31}
                value={workingDays}
                onChange={(e) => setWorkingDays(e.target.value)}
                placeholder={String(comp.workingDaysPerMonth)}
                className="mt-1 block w-28 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Paid days (pro-rata)</span>
              <input
                type="number" min={0} max={31}
                value={paidDays}
                onChange={(e) => setPaidDays(e.target.value)}
                placeholder="full month"
                className="mt-1 block w-28 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm tabular-nums"
              />
            </label>
            <div className="flex gap-2 pb-0.5">
              <button
                onClick={runPreview}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
                Preview
              </button>
              <button
                onClick={generate}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                Generate &amp; save draft
              </button>
            </div>
          </div>

          {genResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Draft saved for {genResult.period}.{" "}
              <Link href={`/admin/payroll/payslips/${genResult.id}`} className="font-medium underline">
                Open payslip →
              </Link>
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { label: "Gross", value: preview.grossPay },
                  { label: "Taxable", value: preview.taxableIncome },
                  { label: "Deductions", value: preview.totalDeductions },
                  { label: "Net", value: preview.netPay, highlight: true },
                  { label: "Employer cost", value: preview.employerCost },
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    className={`rounded-lg border px-2.5 py-2 ${highlight ? "border-emerald-300 bg-emerald-50" : "border-gray-200"}`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
                    <p className={`text-sm font-semibold tabular-nums ${highlight ? "text-emerald-800" : "text-gray-900"}`}>
                      {fmt(value, comp.currency)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase mb-1">Earnings</p>
                  <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
                    {preview.lines.filter((l) => l.type === "EARNING").map((l, i) => (
                      <li key={i} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                        <span className="text-gray-700">{l.componentName}</span>
                        <span className="tabular-nums">{fmt(l.amount, comp.currency)}</span>
                      </li>
                    ))}
                    {preview.lines.filter((l) => l.type === "EARNING").length === 0 && (
                      <li className="px-2.5 py-1.5 text-xs text-gray-400">None</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-rose-700 uppercase mb-1">Deductions</p>
                  <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
                    {preview.lines.filter((l) => l.type !== "EARNING").map((l, i) => (
                      <li key={i} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                        <span className="text-gray-700">{l.componentName}</span>
                        <span className="tabular-nums">{fmt(l.amount, comp.currency)}</span>
                      </li>
                    ))}
                    {preview.lines.filter((l) => l.type !== "EARNING").length === 0 && (
                      <li className="px-2.5 py-1.5 text-xs text-gray-400">None</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ComponentOverrides({
  overrides,
  onChange,
}: { overrides: Record<string, number> | null; onChange: (o: Record<string, number> | null) => void }) {
  const entries = Object.entries(overrides ?? {})
  const [draftCode, setDraftCode] = useState("")
  const [draftAmount, setDraftAmount] = useState("")

  function add() {
    const code = draftCode.trim().toUpperCase()
    const amt = Number(draftAmount)
    if (!code || !Number.isFinite(amt)) return
    onChange({ ...(overrides ?? {}), [code]: amt })
    setDraftCode(""); setDraftAmount("")
  }
  function remove(code: string) {
    const next = { ...(overrides ?? {}) }
    delete next[code]
    onChange(Object.keys(next).length === 0 ? null : next)
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Component overrides</span>
        <span className="text-[10px] text-gray-500">Overrides the country rule amount for this employee.</span>
      </div>
      {entries.length > 0 && (
        <div className="space-y-1 mb-2">
          {entries.map(([code, amt]) => (
            <div key={code} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs uppercase">{code}</span>
              <span className="flex-1 tabular-nums text-xs">{amt.toLocaleString()}</span>
              <button onClick={() => remove(code)} className="text-red-500 hover:text-red-700 text-xs">remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={draftCode}
          onChange={(e) => setDraftCode(e.target.value.toUpperCase())}
          placeholder="CODE (e.g. HOUSING)"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs font-mono"
        />
        <input
          type="number" min={0}
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          placeholder="amount"
          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs tabular-nums"
        />
        <button onClick={add} className="rounded bg-[#0B1E3F] px-3 py-1 text-xs font-medium text-white">Add</button>
      </div>
    </div>
  )
}

function fmt(v: number, c: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v)
  } catch { return `${c} ${v.toFixed(2)}` }
}
