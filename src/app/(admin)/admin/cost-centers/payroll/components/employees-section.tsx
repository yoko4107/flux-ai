"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Loader2, Search, Trash2, ChevronDown, ChevronRight,
  Save, Calculator, FilePlus2, Upload, X, FileUp, Link2,
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
  const [showImport, setShowImport] = useState(false)

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
      {showImport && (
        <BulkSalaryImportModal
          costCenter={costCenter}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); load() }}
        />
      )}

      {/* Search + Import */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email…"
            className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <span className="text-xs text-gray-400">{filtered.length} employees</span>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Import salaries
        </button>
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
  const [period, setPeriod] = useState<string>("")
  useEffect(() => { setPeriod(new Date().toISOString().slice(0, 7)) }, [])
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

type ImportRow = {
  email: string
  baseSalary: number
  currency: string
  workingDaysPerMonth: number
  startedAt: string
}

type ImportResult = { email: string; status: "ok" | "skipped"; reason?: string }

function parseSalaryCSVClient(text: string, defaultCurrency: string): ImportRow[] {
  const today = new Date().toISOString().slice(0, 10)
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return []
  const firstLine = lines[0].toLowerCase()
  const startIdx = firstLine.includes("email") || firstLine.includes("salary") ? 1 : 0
  const results: ImportRow[] = []
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith("#")) continue
    const cols = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
    const emailIdx = cols.findIndex((c) => c.includes("@"))
    if (emailIdx === -1) continue
    const email = cols[emailIdx]
    let baseSalary = NaN
    let currency = defaultCurrency
    let workingDaysPerMonth = 22
    let startedAt = today
    for (let j = 0; j < cols.length; j++) {
      if (j === emailIdx) continue
      const val = cols[j]
      if (!val) continue
      const num = Number(val.replace(/[,_]/g, ""))
      if (!isNaN(num) && isNaN(baseSalary) && num > 0) { baseSalary = num; continue }
      if (/^[A-Z]{3}$/i.test(val) && val.length === 3) { currency = val.toUpperCase(); continue }
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) { startedAt = val.slice(0, 10); continue }
      const days = parseInt(val, 10)
      if (!isNaN(days) && days >= 1 && days <= 31 && !isNaN(baseSalary)) { workingDaysPerMonth = days; continue }
    }
    if (!email || isNaN(baseSalary) || baseSalary <= 0) continue
    results.push({ email, baseSalary, currency, workingDaysPerMonth, startedAt })
  }
  return results
}

function BulkSalaryImportModal({
  costCenter,
  onClose,
  onDone,
}: {
  costCenter: CostCenter
  onClose: () => void
  onDone: () => void
}) {
  const [tab, setTab] = useState<"sheets" | "csv">("sheets")
  const [sheetsUrl, setSheetsUrl] = useState("")
  const [csvText, setCsvText] = useState("")
  const [preview, setPreview] = useState<ImportRow[] | null>(null)
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null)
  const [results, setResults] = useState<{ saved: number; skipped: number; rows: ImportResult[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "")
    reader.readAsText(file)
  }

  function buildPreview() {
    setError(null)
    if (tab === "sheets") {
      if (!sheetsUrl.trim()) { setError("Paste a Google Sheets URL first."); return }
    } else {
      if (!csvText.trim()) { setError("No CSV content — paste text or upload a file."); return }
    }
    if (tab === "csv") {
      const rows = parseSalaryCSVClient(csvText, costCenter.currency)
      if (rows.length === 0) {
        setError("No valid rows found. Expected columns: email, baseSalary, and optionally currency, workingDaysPerMonth, startedAt.")
        return
      }
      setPreview(rows)
    } else {
      setBusy("preview")
      fetch("/api/payroll/admin/compensation/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "sheets", url: sheetsUrl.trim(), costCenterId: costCenter.id, defaultCurrency: costCenter.currency }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.error) { setError(j.error); return }
          // Sheets mode returns saved/skipped directly — re-parse for preview
          setError("Use the preview step: paste the URL then click Preview.")
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(null))

      // For sheets, fetch CSV client-side to show preview before applying
      const match = sheetsUrl.match(/\/spreadsheets\/d\/([^/]+)/)
      if (!match) { setError("Invalid Google Sheets URL."); setBusy(null); return }
      const sheetId = match[1]
      const gidMatch = sheetsUrl.match(/[#&?]gid=(\d+)/)
      const gid = gidMatch ? gidMatch[1] : "0"
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
      setBusy("preview")
      setError(null)
      fetch(exportUrl)
        .then((r) => {
          if (!r.ok) throw new Error(`Could not fetch sheet (HTTP ${r.status}). Make sure it is shared publicly.`)
          return r.text()
        })
        .then((text) => {
          const rows = parseSalaryCSVClient(text, costCenter.currency)
          if (rows.length === 0) throw new Error("No valid salary rows found. Expected columns: email, baseSalary.")
          setPreview(rows)
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(null))
    }
  }

  async function apply() {
    if (!preview) return
    setBusy("apply")
    setError(null)
    try {
      const res = await fetch("/api/payroll/admin/compensation/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "rows", rows: preview, costCenterId: costCenter.id }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error ?? "Apply failed"); return }
      setResults({ saved: j.saved, skipped: j.skipped, rows: j.results })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setBusy(null)
    }
  }

  const EXAMPLE = `email,baseSalary,currency,workingDaysPerMonth,startedAt
yoko@ringkas.homes,10000000,IDR,22,2025-01-01
john@ringkas.homes,8500000,IDR,22,2025-01-01`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Bulk import salaries</h2>
            <p className="text-xs text-gray-500 mt-0.5">For cost center: {costCenter.name}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!results ? (
            <>
              {/* Source tabs */}
              <div className="flex gap-3 border-b border-gray-200">
                {(["sheets", "csv"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTab(t); setPreview(null); setError(null) }}
                    className={`flex items-center gap-1.5 pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                      tab === t ? "border-blue-700 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t === "sheets" ? <><Link2 className="h-3.5 w-3.5" /> Google Sheets</> : <><FileUp className="h-3.5 w-3.5" /> CSV file / paste</>}
                  </button>
                ))}
              </div>

              {tab === "sheets" ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-700">Google Sheets URL</label>
                  <input
                    value={sheetsUrl}
                    onChange={(e) => { setSheetsUrl(e.target.value); setPreview(null) }}
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-400">Sheet must be shared as "Anyone with the link can view". Columns: email, baseSalary, currency (optional), workingDaysPerMonth (optional), startedAt (optional).</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="block text-xs font-medium text-gray-700">CSV content</label>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="text-[11px] text-blue-700 hover:underline"
                    >Upload file</button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
                  </div>
                  <textarea
                    value={csvText}
                    onChange={(e) => { setCsvText(e.target.value); setPreview(null) }}
                    placeholder={EXAMPLE}
                    rows={5}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}

              {!preview ? (
                <button
                  onClick={buildPreview}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Preview rows
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-700">{preview.length} row{preview.length !== 1 ? "s" : ""} ready to import</p>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          {["Email", "Base salary", "Currency", "Working days", "Started"].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-3 py-1.5 text-gray-700">{row.email}</td>
                            <td className="px-3 py-1.5 tabular-nums text-gray-900">{row.baseSalary.toLocaleString()}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-700">{row.currency}</td>
                            <td className="px-3 py-1.5 tabular-nums text-gray-700">{row.workingDaysPerMonth}</td>
                            <td className="px-3 py-1.5 text-gray-700">{row.startedAt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={apply}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {busy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Apply {preview.length} salaries
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Results */
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-800">{results.saved}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Saved</p>
                </div>
                <div className="rounded-lg border-2 border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-amber-800">{results.skipped}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Skipped</p>
                </div>
              </div>
              {results.rows.some((r) => r.status === "skipped") && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200">
                  {results.rows.filter((r) => r.status === "skipped").map((r, i) => (
                    <div key={i} className="flex items-start gap-2 border-b border-gray-100 px-3 py-2 text-xs last:border-0">
                      <span className="font-medium text-gray-700">{r.email}</span>
                      <span className="text-amber-700">{r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={onDone}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-4 py-2 text-xs font-medium text-white"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(v: number, c: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v)
  } catch { return `${c} ${v.toFixed(2)}` }
}
