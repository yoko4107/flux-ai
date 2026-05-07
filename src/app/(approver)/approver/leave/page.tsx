"use client"

import { useEffect, useState } from "react"
import { CalendarDays, Loader2, X, CheckCircle2, XCircle, MessageSquarePlus, Clock } from "lucide-react"
import { LeaveCalendar } from "@/components/leave/leave-calendar"

// Approver leave portal.
// Pending queue with three actions per row:
//   ✓ Approve (immediate)
//   ✕ Reject (modal — rejection reason ≥20 chars)
//   📅 Propose different dates (modal)

type LeaveRequest = {
  id: string
  status: string
  startDate: string
  endDate: string
  totalDays: number
  reason: string | null
  isHalfDay: boolean
  halfDayPeriod: string | null
  negotiationRound: number
  leaveType: { id: string; name: string; colorHex: string }
  employee: { id: string; name: string | null; email: string | null }
  proposals: { id: string; proposerRole: string; proposedStart: string; proposedEnd: string; proposedDays: number; message: string; status: string; createdAt: string }[]
  createdAt: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export default function ApproverLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"pending" | "negotiating" | "all">("pending")
  const [rejectFor, setRejectFor] = useState<LeaveRequest | null>(null)
  const [proposeFor, setProposeFor] = useState<LeaveRequest | null>(null)
  const [showOT, setShowOT] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/leave/request?scope=to-approve")
      const data = await res.json()
      setRequests(data.requests ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const filtered = requests.filter((r) =>
    tab === "pending" ? r.status === "PENDING"
    : tab === "negotiating" ? r.status === "NEGOTIATING"
    : true
  )

  async function approve(r: LeaveRequest) {
    await fetch(`/api/leave/request/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">Review your team's leave requests. Action links also work from email.</p>
        </div>
        <button
          onClick={() => setShowOT(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Clock className="h-4 w-4" /> Log Overtime
        </button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["pending", "negotiating", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === t ? "border-[#0B1E3F] text-[#0B1E3F]" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t === "pending" ? "Pending" : t === "negotiating" ? "Negotiating" : "All"}
            {t === "pending" && (
              <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                {requests.filter((r) => r.status === "PENDING").length}
              </span>
            )}
            {t === "negotiating" && (
              <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">
                {requests.filter((r) => r.status === "NEGOTIATING").length}
              </span>
            )}
          </button>
        ))}
        {loading && <Loader2 className="ml-3 h-4 w-4 animate-spin self-center text-gray-400" />}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const latestProposal = r.proposals.find((p) => p.status === "PENDING")
            const waitingOnEmployee = latestProposal?.proposerRole === "SUPERVISOR"
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.colorHex }} />
                      <span className="font-medium text-gray-900">{r.employee.name ?? r.employee.email}</span>
                      <span className="text-sm text-gray-500">· {r.leaveType.name}</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      {fmt(r.startDate)}{r.startDate !== r.endDate && ` – ${fmt(r.endDate)}`} · {r.totalDays} day{r.totalDays === 1 ? "" : "s"}
                      {r.isHalfDay && r.halfDayPeriod && ` (${r.halfDayPeriod})`}
                    </div>
                    {r.reason && (
                      <div className="text-sm text-gray-600 italic">“{r.reason}”</div>
                    )}
                    {r.status === "NEGOTIATING" && (
                      <div className="mt-2 text-xs text-orange-700">
                        {waitingOnEmployee ? "Waiting on employee response" : "Employee counter-proposed — your move"}
                        {" · "}round {r.negotiationRound}/3
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => approve(r)}
                      className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => setRejectFor(r)}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => setProposeFor(r)}
                      disabled={r.negotiationRound >= 3}
                      title={r.negotiationRound >= 3 ? "Negotiation limit reached" : ""}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" /> Propose dates
                    </button>
                  </div>
                </div>

                {r.proposals.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-800">
                      Negotiation thread ({r.proposals.length})
                    </summary>
                    <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-4 text-xs">
                      {r.proposals.map((p) => (
                        <div key={p.id}>
                          <span className="font-medium">{p.proposerRole === "SUPERVISOR" ? "You" : "Employee"} proposed</span>{" "}
                          {fmt(p.proposedStart)} – {fmt(p.proposedEnd)} ({p.proposedDays} days) ·{" "}
                          <span className="text-gray-500">{p.status.toLowerCase()}</span>
                          <div className="text-gray-600 italic">“{p.message}”</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}

      {rejectFor && (
        <RejectModal request={rejectFor} onClose={() => setRejectFor(null)} onDone={() => { setRejectFor(null); load() }} />
      )}
      {proposeFor && (
        <ProposeModal request={proposeFor} onClose={() => setProposeFor(null)} onDone={() => { setProposeFor(null); load() }} />
      )}
      {showOT && <OvertimeModal onClose={() => setShowOT(false)} onDone={() => setShowOT(false)} />}

      <LeaveCalendar scope="to-approve" onLeaveChanged={load} />

      <TeamCalendar />
      <TodayLocations />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team calendar — next 60 days of approved leaves for direct reports.
// ---------------------------------------------------------------------------

function TeamCalendar() {
  const [items, setItems] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date()
    const horizon = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000)
    const from = today.toISOString().slice(0, 10)
    const to = horizon.toISOString().slice(0, 10)
    fetch(`/api/leave/request?scope=to-approve&status=APPROVED&from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.requests ?? []); setLoading(false) })
  }, [])

  if (loading) return null
  if (items.length === 0) return null

  // Group by week-of-the-month for a quick visual scan.
  const byWeek = new Map<string, LeaveRequest[]>()
  for (const r of items) {
    const start = new Date(r.startDate)
    const weekKey = `${start.getUTCFullYear()}-W${String(Math.ceil((start.getUTCDate() + (new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)).getUTCDay())) / 7)).padStart(2, "0")}-${start.getUTCMonth()+1}`
    const arr = byWeek.get(weekKey) ?? []
    arr.push(r)
    byWeek.set(weekKey, arr)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3 text-sm font-semibold">Upcoming team leaves (next 60 days)</div>
      <ul className="divide-y divide-gray-100">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.colorHex }} />
            <span className="font-medium text-gray-900">{r.employee.name ?? r.employee.email}</span>
            <span className="text-gray-500">·</span>
            <span className="text-gray-700">{fmt(r.startDate)}{r.startDate !== r.endDate && ` – ${fmt(r.endDate)}`}</span>
            <span className="ml-auto text-xs text-gray-400">{r.leaveType.name} · {r.totalDays}d</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Today's team locations (supervisor read-only view)
// ---------------------------------------------------------------------------

function TodayLocations() {
  const [logs, setLogs] = useState<{
    id: string
    date: string
    locationType: "OFFICE" | "WFH" | "WFS"
    locationName: string | null
    notes: string | null
    employee: { id: string; name: string | null; email: string | null }
  }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/leave/work-location?from=${today}&to=${today}`)
      .then((r) => r.json())
      .then((d) => { setLogs(d.logs ?? []); setLoading(false) })
  }, [])

  if (loading) return null
  if (logs.length === 0) return null

  const tone: Record<string, string> = {
    OFFICE: "bg-blue-50 text-blue-700",
    WFH: "bg-purple-50 text-purple-700",
    WFS: "bg-orange-50 text-orange-700",
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-3 text-sm font-semibold">Where the team is today</div>
      <ul className="divide-y divide-gray-100">
        {logs.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone[l.locationType]}`}>{l.locationType}</span>
            <span className="text-gray-900">{l.employee.name ?? l.employee.email}</span>
            {l.locationName && <span className="text-gray-500">· {l.locationName}</span>}
            {l.notes && <span className="ml-auto text-xs text-gray-400 italic truncate max-w-xs">{l.notes}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OvertimeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [reports, setReports] = useState<{ id: string; name: string | null; email: string | null }[]>([])
  const [employeeId, setEmployeeId] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState(2)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ lieuDays: number; multiplier: number; dayType: string } | null>(null)

  // Pull the supervisor's direct reports for the dropdown.
  useEffect(() => {
    fetch("/api/leave/request?scope=to-approve")
      .then((r) => r.json())
      .then((d: { requests: { employee: { id: string; name: string | null; email: string | null } }[] }) => {
        const seen = new Set<string>()
        const list: { id: string; name: string | null; email: string | null }[] = []
        for (const req of d.requests ?? []) {
          if (!seen.has(req.employee.id)) {
            seen.add(req.employee.id)
            list.push(req.employee)
          }
        }
        setReports(list)
        if (list.length && !employeeId) setEmployeeId(list[0].id)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/leave/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, date, hoursWorked: hours, notes: notes || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || "Failed"); return }
      setSuccess({ lieuDays: data.record.lieuDaysEarned, multiplier: data.record.multiplier, dayType: data.record.dayType })
      setTimeout(onDone, 1800)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Log overtime</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          {success ? (
            <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="mb-1 h-5 w-5" />
              Logged: <strong>{success.lieuDays.toFixed(2)} lieu days</strong> credited (×{success.multiplier}, {success.dayType.toLowerCase()}).
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Employee
                <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {reports.length === 0 && <option value="">No direct reports yet</option>}
                  {reports.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.email}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date
                  <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Hours
                  <input required type="number" step="0.5" min={0.25} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Notes (optional)
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="text-xs text-gray-500">
                Multipliers: weekday ×1.5 · weekend ×2.0 · public holiday ×3.0. 8 hours at multiplier M earns 1×M lieu days. Credits expire after 6 months.
              </div>
              {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            </>
          )}
        </div>
        {!success && (
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
            <button type="submit" disabled={busy || !employeeId} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Log overtime
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

function RejectModal({ request, onClose, onDone }: { request: LeaveRequest; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 20) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/leave/request/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejectionReason: reason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed"); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Reject leave request</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-gray-700">Reason for rejection — the employee will see this exactly as written.</p>
          <textarea required minLength={20} maxLength={2000} rows={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 20 characters…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          <div className="text-xs text-gray-500">{reason.trim().length} / 20 minimum</div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || reason.trim().length < 20} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send rejection
          </button>
        </div>
      </form>
    </div>
  )
}

function ProposeModal({ request, onClose, onDone }: { request: LeaveRequest; onClose: () => void; onDone: () => void }) {
  const [start, setStart] = useState(request.startDate.slice(0, 10))
  const [end, setEnd] = useState(request.endDate.slice(0, 10))
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (message.trim().length < 20) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/leave/request/${request.id}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedStart: start, proposedEnd: end, message: message.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed"); return }
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Propose different dates</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="text-sm text-gray-600">
            Original request: <strong>{fmt(request.startDate)} – {fmt(request.endDate)}</strong> ({request.totalDays} days)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500 uppercase tracking-wider">Start
              <input required type="date" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-500 uppercase tracking-wider">End
              <input required type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs text-gray-500 uppercase tracking-wider">
            Your message to the employee
            <textarea required minLength={20} maxLength={2000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Why these dates? (≥20 chars)" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </label>
          <div className="text-xs text-gray-500">{message.trim().length} / 20 minimum</div>
          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={busy || message.trim().length < 20} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send proposal
          </button>
        </div>
      </form>
    </div>
  )
}
