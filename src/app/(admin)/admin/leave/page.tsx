"use client"

import { useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Calendar, BarChart3, Mail, ListTree, Clock, X, Gift, Sliders, RotateCcw, CheckCircle2, Users as UsersIcon, CalendarPlus } from "lucide-react"

// Admin leave console — single page with tabs.
//   1. Dashboard  — KPIs
//   2. Holidays   — list + add + delete (per org)
//   3. Leave types — read-only for now (seeded by script)
//   4. Email audit log

type Tab = "dashboard" | "balances" | "holidays" | "events" | "types" | "overtime" | "policy" | "audit"

export default function AdminLeavePage() {
  const [tab, setTab] = useState<Tab>("dashboard")

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Leave & Calendar — Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Holidays, leave types, analytics, email audit log.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "dashboard", label: "Dashboard", icon: BarChart3 },
          { id: "balances", label: "Balances", icon: UsersIcon },
          { id: "holidays", label: "Holidays", icon: Calendar },
          { id: "events", label: "Company events", icon: CalendarPlus },
          { id: "types", label: "Leave types", icon: ListTree },
          { id: "overtime", label: "Overtime", icon: Clock },
          { id: "policy", label: "Policy", icon: Sliders },
          { id: "audit", label: "Email audit", icon: Mail },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 ${
              tab === t.id ? "border-[#0B1E3F] text-[#0B1E3F]" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "balances" && <Balances />}
      {tab === "holidays" && <Holidays />}
      {tab === "events" && <Events />}
      {tab === "types" && <Types />}
      {tab === "overtime" && <Overtime />}
      {tab === "policy" && <Policy />}
      {tab === "audit" && <Audit />}
    </div>
  )
}

// ---- Balances (admin) ----------------------------------------------------

type AdminUser = { id: string; name: string | null; email: string | null }
type AdjustmentRow = {
  id: string
  year: number
  days: number
  reason: string
  createdAt: string
  employee: AdminUser
  leaveType: { id: string; code: string; name: string; colorHex: string }
  grantedBy: { id: string; name: string | null }
}
type AdminBalance = {
  leaveTypeId: string
  code: string
  name: string
  colorHex: string
  maxDaysPerYear: number | null
  used: number
  remaining: number | null
  carriedOver?: number
  adjustment?: number
}

function Balances() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [balances, setBalances] = useState<AdminBalance[]>([])
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [adjOpen, setAdjOpen] = useState<{ leaveTypeId: string; code: string; name: string } | null>(null)

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users ?? d ?? []) as AdminUser[]
        setUsers(list)
        if (list.length && !selected) setSelected(list[0])
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    if (!selected) return
    setLoading(true)
    const [bal, adj] = await Promise.all([
      fetch(`/api/leave/balance/${selected.id}`).then((r) => r.json()),
      fetch(`/api/leave/admin/adjustment?employeeId=${selected.id}`).then((r) => r.json()),
    ])
    setBalances(bal.balances ?? [])
    setAdjustments(adj.adjustments ?? [])
    setLoading(false)
  }
  useEffect(() => { if (selected) load() }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-gray-200 bg-white p-2 max-h-[70vh] overflow-y-auto">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setSelected(u)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.id === u.id ? "bg-[#0B1E3F] text-white" : "hover:bg-gray-50 text-gray-800"}`}
          >
            <div className="font-medium truncate">{u.name ?? u.email}</div>
            {u.name && <div className={`text-xs truncate ${selected?.id === u.id ? "text-white/70" : "text-gray-500"}`}>{u.email}</div>}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {!selected ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
            Pick an employee.
          </div>
        ) : loading ? (
          <Loading />
        ) : (
          <>
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{selected.name ?? selected.email}</h3>
                  <p className="text-xs text-gray-500">Year {new Date().getUTCFullYear()}</p>
                </div>
              </div>
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-right">Used</th>
                    <th className="px-4 py-2 text-right">Cap</th>
                    <th className="px-4 py-2 text-right">Carried</th>
                    <th className="px-4 py-2 text-right">Adjust</th>
                    <th className="px-4 py-2 text-right">Remaining</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {balances.map((b) => (
                    <tr key={b.leaveTypeId}>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.colorHex }} />
                          {b.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.used}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{b.maxDaysPerYear ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-700">{b.carriedOver || "—"}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${b.adjustment && b.adjustment !== 0 ? (b.adjustment > 0 ? "text-green-700" : "text-red-700") : ""}`}>
                        {b.adjustment ? (b.adjustment > 0 ? `+${b.adjustment}` : b.adjustment) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{b.remaining ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => setAdjOpen({ leaveTypeId: b.leaveTypeId, code: b.code, name: b.name })} className="rounded p-1 text-blue-600 hover:bg-blue-50" title="Adjust balance">±</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {adjustments.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3 text-sm font-semibold">Adjustment history</div>
                <ul className="divide-y divide-gray-100">
                  {adjustments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: a.leaveType.colorHex }} />
                      <span className="text-gray-800">{a.leaveType.name}</span>
                      <span className={`tabular-nums font-medium ${a.days > 0 ? "text-green-700" : "text-red-700"}`}>
                        {a.days > 0 ? "+" : ""}{a.days} day{Math.abs(a.days) === 1 ? "" : "s"}
                      </span>
                      <span className="text-xs text-gray-500">· {a.year}</span>
                      <span className="text-xs text-gray-500 italic truncate">{a.reason}</span>
                      <span className="ml-auto text-xs text-gray-400">{a.grantedBy.name ?? "—"} · {new Date(a.createdAt).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {adjOpen && selected && (
        <AdjustmentModal
          employee={selected}
          leaveType={adjOpen}
          onClose={() => setAdjOpen(null)}
          onDone={() => { setAdjOpen(null); load() }}
        />
      )}
    </div>
  )
}

function AdjustmentModal({ employee, leaveType, onClose, onDone }: { employee: AdminUser; leaveType: { leaveTypeId: string; code: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState<number>(0)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (days === 0 || reason.trim().length < 5) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/leave/admin/adjustment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, leaveTypeId: leaveType.leaveTypeId, days, reason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed"); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Adjust balance</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div>{employee.name ?? employee.email} · <strong>{leaveType.name}</strong></div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Days (positive = grant, negative = clawback)
            <input required type="number" step="0.25" min={-100} max={100} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums" />
          </label>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Reason (≥5 chars)
            <textarea required minLength={5} maxLength={2000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. mid-year hire prorated grant; medical leave bank topup" />
          </label>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy || days === 0 || reason.trim().length < 5} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Apply adjustment
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Overtime ------------------------------------------------------------

function Overtime() {
  const [records, setRecords] = useState<{
    id: string
    date: string
    hoursWorked: number
    dayType: string
    multiplier: number
    lieuDaysEarned: number
    lieuExpiresAt: string | null
    status: string
    notes: string | null
    employee: { id: string; name: string | null; email: string | null }
    supervisor: { id: string; name: string | null }
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [grantOpen, setGrantOpen] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch("/api/leave/overtime").then((r) => r.json())
    setRecords(data.records ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function reject(id: string) {
    const reason = prompt("Reason for rejecting this overtime entry (≥10 chars):")
    if (!reason || reason.trim().length < 10) return
    await fetch(`/api/leave/overtime/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REJECT", reason: reason.trim() }),
    })
    load()
  }

  async function del(id: string) {
    if (!confirm("Delete this overtime entry? This is irreversible.")) return
    await fetch(`/api/leave/overtime/${id}`, { method: "DELETE" })
    load()
  }

  if (loading) return <Loading />

  const totalLieuApproved = records
    .filter((r) => r.status === "APPROVED")
    .reduce((acc, r) => acc + r.lieuDaysEarned, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 flex-1">
          <Kpi label="Total entries" value={records.length} />
          <Kpi label="Approved" value={records.filter((r) => r.status === "APPROVED").length} accent="green" />
          <Kpi label="Lieu days outstanding" value={totalLieuApproved.toFixed(1)} hint="across all employees" />
        </div>
        <button onClick={() => setGrantOpen(true)} className="ml-3 inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-2 text-sm font-medium text-white">
          <Gift className="h-3.5 w-3.5" /> Grant lieu day
        </button>
      </div>
      {grantOpen && <GrantLieuModal onClose={() => setGrantOpen(false)} onDone={() => { setGrantOpen(false); load() }} />}

      {records.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
          No overtime logged yet.
        </div>
      ) : (
        <table className="min-w-full rounded-xl border border-gray-200 bg-white text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Day type</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2 text-right">×</th>
              <th className="px-4 py-2 text-right">Lieu days</th>
              <th className="px-4 py-2 text-left">Expires</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Logged by</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {records.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 tabular-nums">{r.date.slice(0, 10)}</td>
                <td className="px-4 py-2">{r.employee.name ?? r.employee.email}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.dayType.toLowerCase().replace("_", " ")}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.hoursWorked}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.multiplier}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{r.lieuDaysEarned.toFixed(2)}</td>
                <td className="px-4 py-2 text-xs text-gray-500 tabular-nums">{r.lieuExpiresAt ? r.lieuExpiresAt.slice(0, 10) : "—"}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    r.status === "APPROVED" ? "bg-green-100 text-green-800" :
                    r.status === "REJECTED" ? "bg-red-100 text-red-800" :
                    "bg-yellow-100 text-yellow-800"
                  }`}>{r.status.toLowerCase()}</span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.supervisor.name ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    {r.status === "APPROVED" && (
                      <button onClick={() => reject(r.id)} className="rounded p-1 text-orange-600 hover:bg-orange-50" title="Reverse">
                        ↺
                      </button>
                    )}
                    <button onClick={() => del(r.id)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---- Dashboard -----------------------------------------------------------

function Dashboard() {
  const [data, setData] = useState<{
    byStatus: Record<string, number>
    totalRequests: number
    negotiationRate: number
    avgResolutionDays: number
    topLeaveTypes: { id: string; name: string; colorHex: string; days: number }[]
  } | null>(null)
  useEffect(() => {
    fetch("/api/leave/admin/analytics").then((r) => r.json()).then(setData)
  }, [])
  if (!data) return <Loading />
  const { byStatus, totalRequests, negotiationRate, avgResolutionDays, topLeaveTypes } = data
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total requests" value={totalRequests} />
        <Kpi label="Approved" value={byStatus.APPROVED ?? 0} accent="green" />
        <Kpi label="Pending" value={byStatus.PENDING ?? 0} accent="yellow" />
        <Kpi label="Negotiating" value={byStatus.NEGOTIATING ?? 0} accent="orange" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Kpi label="Negotiation rate" value={`${(negotiationRate * 100).toFixed(0)}%`} hint="resolved requests that went through proposals" />
        <Kpi label="Avg resolution" value={`${avgResolutionDays.toFixed(1)} days`} hint="from submission to approve / reject" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3 text-sm font-semibold">Top leave types by approved days</div>
        {topLeaveTypes.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No approved leaves yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {topLeaveTypes.map((lt) => (
              <div key={lt.id} className="flex items-center gap-3 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: lt.colorHex }} />
                <span className="text-sm text-gray-800">{lt.name}</span>
                <span className="ml-auto text-sm font-semibold text-gray-900">{lt.days} days</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: "green" | "yellow" | "orange" }) {
  const accentMap = {
    green: "text-green-700",
    yellow: "text-yellow-700",
    orange: "text-orange-700",
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? accentMap[accent] : "text-gray-900"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

// ---- Holidays ------------------------------------------------------------

function Holidays() {
  const [year, setYear] = useState(new Date().getUTCFullYear())
  const [holidays, setHolidays] = useState<{ id: string; name: string; date: string; countryCode: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", date: "", countryCode: "" })
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch(`/api/leave/holidays?year=${year}`).then((r) => r.json())
    setHolidays(data.holidays ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [year])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await fetch("/api/leave/admin/holiday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      setForm({ name: "", date: "", countryCode: "" })
      setShowAdd(false)
      load()
    } finally { setBusy(false) }
  }

  async function del(id: string) {
    if (!confirm("Delete this holiday?")) return
    await fetch(`/api/leave/admin/holiday/${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded border border-gray-300 px-2 py-1 text-sm">
            {[year - 1, year, year + 1, year + 2].map((y) => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white">
          <Plus className="h-3.5 w-3.5" /> Add holiday
        </button>
      </div>

      {loading ? <Loading /> : holidays.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
          No holidays on file for {year}. Run the seed script or add one manually.
        </div>
      ) : (
        <table className="min-w-full rounded-xl border border-gray-200 bg-white text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Country</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {holidays.map((h) => (
              <tr key={h.id}>
                <td className="px-4 py-2 tabular-nums">{h.date.slice(0, 10)}</td>
                <td className="px-4 py-2">{h.name}</td>
                <td className="px-4 py-2">{h.countryCode}</td>
                <td className="px-4 py-2 text-gray-500">{h.type}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => del(h.id)} className="rounded p-1 text-red-500 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={add} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
            <div className="border-b border-gray-200 px-5 py-3 font-semibold">Add holiday</div>
            <div className="space-y-3 p-5">
              <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input placeholder="Country code (defaults to org)" maxLength={2} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase" />
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ---- Events --------------------------------------------------------------

type CompanyEvt = {
  id: string
  title: string
  description: string | null
  startDate: string
  endDate: string
  allDay: boolean
  category: string
  colorHex: string
  location: string | null
}

function Events() {
  const [evts, setEvts] = useState<CompanyEvt[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<CompanyEvt | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch("/api/leave/admin/events").then((r) => r.json())
    setEvts(d.events ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function del(e: CompanyEvt) {
    if (!confirm(`Delete "${e.title}"?`)) return
    await fetch(`/api/leave/admin/events/${e.id}`, { method: "DELETE" })
    load()
  }

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Company-wide events surfaced on every employee's calendar (alongside holidays + their own leaves).
        </p>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white">
          <Plus className="h-3.5 w-3.5" /> New event
        </button>
      </div>
      {evts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-sm text-gray-500">
          No company events yet.
        </div>
      ) : (
        <table className="min-w-full rounded-xl border border-gray-200 bg-white text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Dates</th>
              <th className="px-4 py-2 text-left">Location</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {evts.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.colorHex }} />
                    {e.title}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{e.category}</td>
                <td className="px-4 py-2 tabular-nums text-xs">
                  {e.startDate.slice(0, 10)}
                  {e.startDate.slice(0, 10) !== e.endDate.slice(0, 10) && ` → ${e.endDate.slice(0, 10)}`}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{e.location ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEdit(e)} className="rounded p-1 text-blue-600 hover:bg-blue-50" title="Edit">✎</button>
                    <button onClick={() => del(e)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(edit || adding) && (
        <EventModal
          existing={edit}
          onClose={() => { setEdit(null); setAdding(false) }}
          onSaved={() => { setEdit(null); setAdding(false); load() }}
        />
      )}
    </div>
  )
}

function EventModal({ existing, onClose, onSaved }: { existing: CompanyEvt | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [startDate, setStartDate] = useState(existing?.startDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(existing?.endDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [category, setCategory] = useState<CompanyEvt["category"]>(existing?.category ?? "COMPANY")
  const [colorHex, setColorHex] = useState(existing?.colorHex ?? "#22D3EE")
  const [location, setLocation] = useState(existing?.location ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body = { title, description: description || null, startDate, endDate, category, colorHex, location: location || null }
      const url = existing ? `/api/leave/admin/events/${existing.id}` : "/api/leave/admin/events"
      const method = existing ? "PATCH" : "POST"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed"); return }
      onSaved()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">{existing ? "Edit event" : "New company event"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Description (optional)
            <textarea rows={3} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start
              <input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">End
              <input required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Category
              <select value={category} onChange={(e) => setCategory(e.target.value as CompanyEvt["category"])} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="COMPANY">Company</option>
                <option value="SPECIAL">Special</option>
                <option value="TRAINING">Training</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Colour
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-gray-300 px-1" />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Location (optional)
            <input value={location ?? ""} onChange={(e) => setLocation(e.target.value)} maxLength={200} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {existing ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Leave types ---------------------------------------------------------

type LeaveType = {
  id: string
  code: string
  name: string
  description: string | null
  colorHex: string
  maxDaysPerYear: number | null
  requiresApproval: boolean
  isPaid: boolean
}

function Types() {
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<LeaveType | null>(null)
  const [adding, setAdding] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch("/api/leave/types").then((r) => r.json())
    setTypes(d.leaveTypes ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function del(t: LeaveType) {
    if (!confirm(`Delete "${t.name}" leave type? Refused if any leave request still uses it.`)) return
    const res = await fetch(`/api/leave/admin/types/${t.id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || "Failed")
      return
    }
    load()
  }

  if (loading) return <Loading />
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Default types are seeded by <code>scripts/seed-leave-data.ts</code>. Edit caps, colours, paid/unpaid here.
        </p>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white">
          <Plus className="h-3.5 w-3.5" /> Add type
        </button>
      </div>
      <table className="min-w-full rounded-xl border border-gray-200 bg-white text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">Code</th>
            <th className="px-4 py-2 text-right">Max days / yr</th>
            <th className="px-4 py-2 text-left">Approval</th>
            <th className="px-4 py-2 text-left">Paid</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {types.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.colorHex }} />
                  {t.name}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-500 font-mono text-xs">{t.code}</td>
              <td className="px-4 py-2 text-right tabular-nums">{t.maxDaysPerYear ?? "—"}</td>
              <td className="px-4 py-2 text-xs">{t.requiresApproval ? "Required" : "Auto"}</td>
              <td className="px-4 py-2 text-xs">{t.isPaid ? "Yes" : "No"}</td>
              <td className="px-4 py-2">
                <div className="flex justify-end gap-1">
                  <button onClick={() => setEdit(t)} className="rounded p-1 text-blue-600 hover:bg-blue-50" title="Edit">✎</button>
                  <button onClick={() => del(t)} className="rounded p-1 text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(edit || adding) && (
        <LeaveTypeModal
          existing={edit}
          onClose={() => { setEdit(null); setAdding(false) }}
          onSaved={() => { setEdit(null); setAdding(false); load() }}
        />
      )}
    </div>
  )
}

function LeaveTypeModal({ existing, onClose, onSaved }: { existing: LeaveType | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(existing?.code ?? "")
  const [name, setName] = useState(existing?.name ?? "")
  const [description, setDescription] = useState(existing?.description ?? "")
  const [colorHex, setColorHex] = useState(existing?.colorHex ?? "#3B82F6")
  const [maxDaysPerYear, setMaxDaysPerYear] = useState<string>(existing?.maxDaysPerYear == null ? "" : String(existing.maxDaysPerYear))
  const [requiresApproval, setRequiresApproval] = useState(existing?.requiresApproval ?? true)
  const [isPaid, setIsPaid] = useState(existing?.isPaid ?? true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const body: Record<string, unknown> = {
        name,
        description: description || null,
        colorHex,
        maxDaysPerYear: maxDaysPerYear === "" ? null : Number(maxDaysPerYear),
        requiresApproval,
        isPaid,
      }
      let res: Response
      if (existing) {
        res = await fetch(`/api/leave/admin/types/${existing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch("/api/leave/admin/types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, code: code.toUpperCase() }),
        })
      }
      if (!res.ok) { const d = await res.json(); setErr(d.error || "Failed"); return }
      onSaved()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">{existing ? "Edit leave type" : "Add leave type"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          {!existing && (
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Code (immutable, e.g. STUDY_LEAVE)
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={31} pattern="[A-Z][A-Z0-9_]{1,30}" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase" />
            </label>
          )}
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Display name
            <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Description (optional)
            <input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Max days / year (blank = unlimited)
              <input type="number" min={0} max={366} value={maxDaysPerYear} onChange={(e) => setMaxDaysPerYear(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Colour
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-gray-300 px-1" />
            </label>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} /> Requires approval
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid
            </label>
          </div>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {existing ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---- Email audit ---------------------------------------------------------

const EMAIL_TYPES = [
  "REQUEST_SUBMITTED", "APPROVED", "REJECTED",
  "SUPERVISOR_PROPOSAL", "EMPLOYEE_COUNTER", "PROPOSAL_AGREED",
  "REMINDER_PENDING", "REMINDER_LEAVE",
  "OVERTIME_REQUEST", "OVERTIME_APPROVED",
] as const

function Audit() {
  const [events, setEvents] = useState<{
    id: string
    sentAt: string
    emailType: string
    toEmail: string
    subject: string
    actionTaken: string | null
    tokenUsedAt: string | null
    leaveRequest: { id: string; status: string; employee: { name: string | null; email: string | null }; leaveType: { name: string } }
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ type: "", to: "", action: "", from: "", toDate: "" })

  async function load() {
    setLoading(true)
    const qs = new URLSearchParams()
    if (filters.type) qs.set("type", filters.type)
    if (filters.to) qs.set("to", filters.to)
    if (filters.action) qs.set("action", filters.action)
    if (filters.from) qs.set("from", filters.from)
    if (filters.toDate) qs.set("to_date", filters.toDate)
    const d = await fetch(`/api/leave/admin/email-audit?${qs.toString()}`).then((r) => r.json())
    setEvents(d.events ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [filters.type, filters.action]) // eslint-disable-line react-hooks/exhaustive-deps

  function clearFilters() {
    setFilters({ type: "", to: "", action: "", from: "", toDate: "" })
  }

  const hasFilters = filters.type || filters.to || filters.action || filters.from || filters.toDate

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); load() }}
        className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-6"
      >
        <select
          value={filters.type}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        >
          <option value="">All types</option>
          {EMAIL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        >
          <option value="">All actions</option>
          <option value="unread">Not yet acted on</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="AGREED">Agreed</option>
          <option value="DISAGREED">Disagreed</option>
          <option value="SUPERSEDED">Superseded</option>
          <option value="EXPIRED">Expired</option>
          <option value="SEND_FAILED">Send failed</option>
        </select>
        <input
          type="email"
          placeholder="Recipient email"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs md:col-span-2"
        />
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          title="From date"
        />
        <input
          type="date"
          value={filters.toDate}
          onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          title="To date"
        />
        <div className="flex items-center gap-2 md:col-span-6">
          <button type="submit" className="rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-xs font-medium text-white">
            Apply
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-800">
              Clear filters
            </button>
          )}
          <span className="ml-auto text-xs text-gray-500">{events.length} {events.length === 1 ? "event" : "events"}</span>
        </div>
      </form>

    <div className="rounded-xl border border-gray-200 bg-white">
      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-500">No emails match the current filters.</div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">To</th>
              <th className="px-4 py-2 text-left">Subject</th>
              <th className="px-4 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 tabular-nums text-xs text-gray-500">{new Date(e.sentAt).toLocaleString()}</td>
                <td className="px-4 py-2 text-xs"><span className="rounded bg-gray-100 px-1.5 py-0.5">{e.emailType}</span></td>
                <td className="px-4 py-2 text-xs">{e.toEmail}</td>
                <td className="px-4 py-2 text-xs max-w-md truncate" title={e.subject}>{e.subject}</td>
                <td className="px-4 py-2 text-xs">
                  {e.actionTaken ? (
                    <span className={`rounded px-1.5 py-0.5 ${
                      e.actionTaken === "EXPIRED" ? "bg-red-50 text-red-700" :
                      e.actionTaken === "SEND_FAILED" ? "bg-red-50 text-red-700" :
                      "bg-green-50 text-green-700"
                    }`}>{e.actionTaken}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
    </div>
  )
}

// ---- Policy --------------------------------------------------------------

type CarryoverPolicy = {
  enabled: boolean
  maxDaysCarried: number
  expiresOnMonthDay: string | null
  applyToCodes: string[]
}

function Policy() {
  const [effective, setEffective] = useState<{ weekday: number; weekend: number; publicHoliday: number; lieuExpiryMonths: number } | null>(null)
  const [isOverride, setIsOverride] = useState(false)
  const [carry, setCarry] = useState<CarryoverPolicy | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function load() {
    const [otData, carryData] = await Promise.all([
      fetch("/api/leave/admin/policy").then((r) => r.json()),
      fetch("/api/leave/admin/carryover").then((r) => r.json()),
    ])
    setEffective(otData.effective)
    setIsOverride(!!otData.isOverride)
    setCarry(carryData.policy)
  }
  useEffect(() => { load() }, [])

  async function saveCarry() {
    if (!carry) return
    setBusy(true); setSaved(false)
    try {
      const res = await fetch("/api/leave/admin/carryover", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(carry),
      })
      if (res.ok) { setSaved(true); load() }
    } finally { setBusy(false); setTimeout(() => setSaved(false), 2500) }
  }

  async function save() {
    if (!effective) return
    setBusy(true); setSaved(false)
    try {
      const res = await fetch("/api/leave/admin/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(effective),
      })
      if (res.ok) { setSaved(true); load() }
    } finally { setBusy(false); setTimeout(() => setSaved(false), 2500) }
  }

  async function reset() {
    if (!confirm("Remove the override and revert to country defaults?")) return
    setBusy(true)
    try {
      await fetch("/api/leave/admin/policy", { method: "DELETE" })
      load()
    } finally { setBusy(false) }
  }

  if (!effective) return <Loading />

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Overtime multipliers</h3>
          <span className={`text-xs ${isOverride ? "text-blue-700" : "text-gray-500"}`}>
            {isOverride ? "Custom override" : "Using country defaults"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          A supervisor logs <code>hours × multiplier ÷ 8 = lieu days</code>. Multipliers stay
          in [1, 5]. Pre-set country defaults: VN 1.5/2/3, ID 1.75/2/3, SG 1.5/2/2, MY 1.5/2/3.
          Anything else falls back to 1.5/2/3.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <PolField label="Weekday ×"        value={effective.weekday}       onChange={(v) => setEffective({ ...effective, weekday: v })} />
          <PolField label="Weekend ×"        value={effective.weekend}       onChange={(v) => setEffective({ ...effective, weekend: v })} />
          <PolField label="Public holiday ×" value={effective.publicHoliday} onChange={(v) => setEffective({ ...effective, publicHoliday: v })} />
          <PolField label="Lieu expiry (months)" step={1} min={1} max={36}
                    value={effective.lieuExpiryMonths}
                    onChange={(v) => setEffective({ ...effective, lieuExpiryMonths: Math.round(v) })} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save override
          </button>
          {isOverride && (
            <button onClick={reset} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to country defaults
            </button>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </div>

      {carry && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Annual leave carryover</h3>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={carry.enabled} onChange={(e) => setCarry({ ...carry, enabled: e.target.checked })} />
              Enabled
            </label>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Unused days from the previous calendar year carry into this year's allowance,
            capped at <em>max days carried</em>. Carried days are forfeited after the
            expiry date (if set).
          </p>
          <div className={`mt-4 grid gap-3 md:grid-cols-3 ${carry.enabled ? "" : "opacity-50 pointer-events-none"}`}>
            <PolField label="Max days carried" step={0.5} min={0} max={100}
              value={carry.maxDaysCarried}
              onChange={(v) => setCarry({ ...carry, maxDaysCarried: v })} />
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Expires (MM-DD, blank = never)</span>
              <input type="text" placeholder="03-31" maxLength={5}
                pattern="\d{2}-\d{2}"
                value={carry.expiresOnMonthDay ?? ""}
                onChange={(e) => setCarry({ ...carry, expiresOnMonthDay: e.target.value || null })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Limit to types (codes, comma-separated)</span>
              <input type="text" placeholder="ANNUAL"
                value={carry.applyToCodes.join(",")}
                onChange={(e) => setCarry({ ...carry, applyToCodes: e.target.value.toUpperCase().split(",").map((s) => s.trim()).filter(Boolean) })}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveCarry} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save carryover
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PolField({ label, value, onChange, step = 0.05, min = 1, max = 5 }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      <input
        type="number" step={step} min={min} max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
      />
    </label>
  )
}

function GrantLieuModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string | null }[]>([])
  const [employeeId, setEmployeeId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lieuDays, setLieuDays] = useState(1)
  const [reason, setReason] = useState("")
  const [expiresInMonths, setExpiresInMonths] = useState(6)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.users ?? d ?? []) as { id: string; name: string | null; email: string | null }[]
        setUsers(list)
        if (list.length && !employeeId) setEmployeeId(list[0].id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 5) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/leave/admin/lieu-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, lieuDays, reason: reason.trim(), expiresInMonths }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed"); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Grant lieu day</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-xs text-gray-500">For comp time earned outside the supervisor OT flow.</p>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Employee
            <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Days
              <input required type="number" step="0.25" min={0.25} max={30} value={lieuDays} onChange={(e) => setLieuDays(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry (mo)
              <input required type="number" min={1} max={36} value={expiresInMonths} onChange={(e) => setExpiresInMonths(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Reason (≥5 chars)
            <textarea required minLength={5} maxLength={2000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. on-call rota for 2026-04-30 public holiday" />
          </label>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy || reason.trim().length < 5 || !employeeId} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Grant
          </button>
        </div>
      </form>
    </div>
  )
}
