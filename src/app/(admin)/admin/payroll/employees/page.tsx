"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Loader2, Save, Calculator, FilePlus2, Search, ArrowLeft } from "lucide-react"

// Admin payroll → employees. Pick an employee, edit their compensation
// (base salary, currency, working days, component overrides), and
// generate a payslip for a period.

type User = {
  id: string
  name: string | null
  email: string
  role: string
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
  lines: { componentCode: string; componentName: string; type: string; amount: number; description?: string; sortOrder: number }[]
}

export default function PayrollEmployeesPage() {
  const [users, setUsers] = useState<User[]>([])
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<User | null>(null)

  useEffect(() => {
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []))
  }, [])

  const filtered = useMemo(
    () => users.filter((u) =>
      (u.name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      u.email.toLowerCase().includes(filter.toLowerCase())
    ),
    [users, filter]
  )

  if (selected) {
    return <EmployeeDetail user={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="max-w-5xl space-y-4 p-1">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll · Employees</h1>
          <p className="text-sm text-gray-500 mt-1">Set compensation profiles and generate monthly payslips.</p>
        </div>
        <Link href="/admin/payroll" className="text-sm text-blue-700 hover:underline">← Back to rules</Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email"
            className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No employees match.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  onClick={() => setSelected(u)}
                  className="w-full px-5 py-3 text-left hover:bg-gray-50 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{u.name ?? "—"}</p>
                    <p className="text-xs text-gray-500">{u.email} · {u.role}{u.department ? ` · ${u.department}` : ""}</p>
                  </div>
                  <span className="text-xs text-blue-700">Open →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EmployeeDetail({ user, onBack }: { user: User; onBack: () => void }) {
  const [comp, setComp] = useState<Compensation | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [paidDays, setPaidDays] = useState<string>("")
  const [workingDays, setWorkingDays] = useState<string>("")
  const [preview, setPreview] = useState<CalcPreview | null>(null)
  const [busy, setBusy] = useState<null | "preview" | "generate">(null)
  const [genResult, setGenResult] = useState<{ id: string; period: string } | null>(null)

  async function loadComp() {
    setLoading(true)
    try {
      const r = await fetch(`/api/payroll/admin/compensation/${user.id}`).then((r) => r.json())
      if (r.compensation) {
        const c = r.compensation
        setComp({
          baseSalary: c.baseSalary?.toString() ?? "0",
          currency: c.currency ?? "USD",
          workingDaysPerMonth: c.workingDaysPerMonth ?? 22,
          startedAt: (c.startedAt ?? new Date().toISOString()).slice(0, 10),
          endedAt: c.endedAt ? c.endedAt.slice(0, 10) : null,
          componentOverrides: c.componentOverrides ?? null,
        })
      } else {
        setComp({
          baseSalary: "0",
          currency: "USD",
          workingDaysPerMonth: 22,
          startedAt: new Date().toISOString().slice(0, 10),
          endedAt: null,
          componentOverrides: null,
        })
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { loadComp() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    } finally { setSaving(false) }
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
      <div className="p-10 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-5 p-1">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to employees
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{user.name ?? user.email}</h1>
        <p className="text-sm text-gray-500">{user.email} · {user.role}</p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Compensation profile</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Base salary (per month)</span>
            <input
              type="number" min={0} step={1}
              value={comp.baseSalary}
              onChange={(e) => setComp({ ...comp, baseSalary: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Currency (ISO-4217)</span>
            <input
              value={comp.currency}
              maxLength={3}
              onChange={(e) => setComp({ ...comp, currency: e.target.value.toUpperCase() })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Working days / month</span>
            <input
              type="number" min={1} max={31}
              value={comp.workingDaysPerMonth}
              onChange={(e) => setComp({ ...comp, workingDaysPerMonth: Number(e.target.value) })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Started at</span>
            <input
              type="date"
              value={comp.startedAt}
              onChange={(e) => setComp({ ...comp, startedAt: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Ended at (optional)</span>
            <input
              type="date"
              value={comp.endedAt ?? ""}
              onChange={(e) => setComp({ ...comp, endedAt: e.target.value || null })}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <ComponentOverrides
          overrides={comp.componentOverrides}
          onChange={(o) => setComp({ ...comp, componentOverrides: o })}
        />
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={saveComp}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save compensation
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Generate payslip</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Period (YYYY-MM)</span>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Working days (override)</span>
            <input
              type="number" min={1} max={31}
              value={workingDays}
              onChange={(e) => setWorkingDays(e.target.value)}
              placeholder={String(comp.workingDaysPerMonth)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Paid days (pro-rata)</span>
            <input
              type="number" min={0} max={31}
              value={paidDays}
              onChange={(e) => setPaidDays(e.target.value)}
              placeholder="full month"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={runPreview}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
              Preview
            </button>
            <button
              onClick={generate}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
              Generate &amp; save draft
            </button>
          </div>
        </div>

        {genResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Draft saved for {genResult.period}.{" "}
            <Link href={`/admin/payroll/payslips/${genResult.id}`} className="font-medium underline">Open payslip →</Link>
          </div>
        )}

        {preview && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <Stat label="Gross" value={preview.grossPay} currency={comp.currency} />
              <Stat label="Taxable" value={preview.taxableIncome} currency={comp.currency} />
              <Stat label="Deductions" value={preview.totalDeductions} currency={comp.currency} />
              <Stat label="Net" value={preview.netPay} currency={comp.currency} highlight />
              <Stat label="Employer cost" value={preview.employerCost} currency={comp.currency} />
            </div>
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <LinesList title="Earnings" lines={preview.lines.filter((l) => l.type === "EARNING")} currency={comp.currency} accent="text-emerald-700" />
              <LinesList title="Deductions" lines={preview.lines.filter((l) => l.type === "STATUTORY_DEDUCTION" || l.type === "VOLUNTARY_DEDUCTION")} currency={comp.currency} accent="text-rose-700" />
            </div>
          </div>
        )}
      </section>
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
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Component overrides</span>
        <span className="text-[10px] text-gray-500">Replaces the country rule amount for this employee. Major units.</span>
      </div>
      {entries.length > 0 && (
        <div className="space-y-1 mb-2">
          {entries.map(([code, amt]) => (
            <div key={code} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs uppercase">{code}</span>
              <span className="flex-1 tabular-nums">{amt.toLocaleString()}</span>
              <button onClick={() => remove(code)} className="text-red-500 hover:text-red-700 text-xs">remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={draftCode} onChange={(e) => setDraftCode(e.target.value.toUpperCase())} placeholder="CODE (e.g. HOUSING)" className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono" />
        <input type="number" min={0} value={draftAmount} onChange={(e) => setDraftAmount(e.target.value)} placeholder="amount" className="w-32 rounded border border-gray-300 px-2 py-1 text-sm tabular-nums" />
        <button onClick={add} className="rounded bg-[#0B1E3F] px-3 py-1 text-xs font-medium text-white">Add</button>
      </div>
    </div>
  )
}

function Stat({ label, value, currency, highlight }: { label: string; value: number; currency: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${highlight ? "text-emerald-800" : "text-gray-900"}`}>
        {fmt(value, currency)}
      </p>
    </div>
  )
}

function LinesList({ title, lines, currency, accent }: { title: string; lines: { componentName: string; amount: number }[]; currency: string; accent: string }) {
  return (
    <div>
      <p className={`text-xs font-semibold ${accent} mb-1`}>{title}</p>
      {lines.length === 0 ? (
        <p className="text-xs text-gray-500">None.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center justify-between px-3 py-1.5 text-sm">
              <span className="text-gray-700">{l.componentName}</span>
              <span className="tabular-nums text-gray-900">{fmt(l.amount, currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function fmt(v: number, c: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v)
  } catch { return `${c} ${v.toFixed(2)}` }
}
