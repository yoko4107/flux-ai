"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Loader2, Plus, MessageSquare, X, CheckCircle2, AlertCircle, MapPin, Download, Copy } from "lucide-react"
import { LeaveCalendar } from "@/components/leave/leave-calendar"

// Employee leave portal.
// Shows the balance summary, the new-request form, and the my-history list
// with a proposal-thread modal for any NEGOTIATING request.

type LeaveType = {
  id: string
  code: string
  name: string
  colorHex: string
  maxDaysPerYear: number | null
  isPaid: boolean
}

type Balance = {
  leaveTypeId: string
  code: string
  name: string
  colorHex: string
  maxDaysPerYear: number | null
  used: number
  remaining: number | null
  carriedOver?: number
  isPaid: boolean
}

type Proposal = {
  id: string
  proposerRole: "SUPERVISOR" | "EMPLOYEE"
  proposedStart: string
  proposedEnd: string
  proposedDays: number
  message: string
  status: "PENDING" | "AGREED" | "DISAGREED" | "SUPERSEDED" | "EXPIRED"
  createdAt: string
}

type LeaveRequest = {
  id: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "NEGOTIATING"
  startDate: string
  endDate: string
  totalDays: number
  reason: string | null
  rejectionReason: string | null
  isHalfDay: boolean
  halfDayPeriod: string | null
  leaveType: { id: string; name: string; colorHex: string }
  supervisor: { id: string; name: string | null; email: string | null }
  proposals: Proposal[]
  createdAt: string
}

const STATUS_COLOR: Record<LeaveRequest["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
  NEGOTIATING: "bg-orange-100 text-orange-800",
}

function fmt(iso: string) {
  const d = new Date(iso)
  // Pin locale to avoid SSR / browser hydration mismatch.
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function EmployeeLeavePage() {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [prefill, setPrefill] = useState<{ start: string; end: string } | null>(null)
  const [showLocation, setShowLocation] = useState(false)
  const [showSubscribe, setShowSubscribe] = useState(false)
  const [threadFor, setThreadFor] = useState<LeaveRequest | null>(null)
  // Bump on any change so the calendar component re-fetches its events.
  const [calendarKey, setCalendarKey] = useState(0)

  const negotiatingCount = useMemo(
    () => requests.filter((r) => r.status === "NEGOTIATING").length,
    [requests]
  )

  async function loadAll() {
    setLoading(true)
    try {
      const meRes = await fetch("/api/profile")
      const me = await meRes.json()
      const userId = me?.id
      const [typesRes, balancesRes, requestsRes] = await Promise.all([
        fetch("/api/leave/types"),
        userId ? fetch(`/api/leave/balance/${userId}`) : null,
        fetch("/api/leave/request?scope=mine"),
      ])
      const types = await typesRes.json()
      const balances = balancesRes ? await balancesRes.json() : { balances: [] }
      const reqs = await requestsRes.json()
      setLeaveTypes(types.leaveTypes ?? [])
      setBalances(balances.balances ?? [])
      setRequests(reqs.requests ?? [])
      setCalendarKey((k) => k + 1)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave & Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">
            Request time off. Your supervisor reviews each request and may suggest different dates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubscribe(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Subscribe to your approved leaves in your calendar app"
          >
            <Download className="h-4 w-4" /> Calendar
          </button>
          <button
            onClick={() => setShowLocation(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <MapPin className="h-4 w-4" /> Log Location
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white hover:bg-[#0B1E3F]/90"
          >
            <Plus className="h-4 w-4" /> Request Leave
          </button>
        </div>
      </div>

      {negotiatingCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div className="text-sm text-orange-900">
            <strong>{negotiatingCount} request{negotiatingCount > 1 ? "s" : ""} need your response.</strong>{" "}
            Your supervisor proposed different dates — open the thread to accept or counter-propose.
          </div>
        </div>
      )}

      {/* Balance widgets */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {balances.length === 0 && !loading && (
          <div className="col-span-full rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No leave types defined for your organization yet.
          </div>
        )}
        {balances.map((b) => {
          const total = b.maxDaysPerYear ?? 0
          const remaining = b.remaining ?? null
          const pct = total > 0 ? Math.min(100, (b.used / total) * 100) : 0
          const lowBalance = remaining !== null && remaining < 2
          return (
            <div key={b.leaveTypeId} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: b.colorHex }} />
                <span className="text-sm font-medium text-gray-900 truncate">{b.name}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold text-gray-900">
                {remaining === null ? "—" : remaining}
                <span className="text-sm font-normal text-gray-500"> / {total || "∞"}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">days remaining</div>
              {total > 0 && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: b.colorHex }}
                  />
                </div>
              )}
              {b.carriedOver && b.carriedOver > 0 ? (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  +{b.carriedOver} carried over
                </div>
              ) : null}
              {lowBalance && (
                <div className="mt-2 text-xs text-red-600">Low balance</div>
              )}
            </div>
          )
        })}
      </div>

      <LeaveCalendar
        refreshKey={calendarKey}
        onLeaveChanged={loadAll}
        onRangeCreate={(start, end) => {
          setPrefill({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) })
          setShowForm(true)
        }}
      />

      {/* My history */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">My leave history</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        {requests.length === 0 && !loading ? (
          <div className="p-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No leave requests yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" /> Submit your first request
            </button>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Type</th>
                <th className="px-5 py-2 text-left font-medium">Dates</th>
                <th className="px-5 py-2 text-right font-medium">Days</th>
                <th className="px-5 py-2 text-left font-medium">Status</th>
                <th className="px-5 py-2 text-left font-medium">Thread</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => {
                const proposalCount = r.proposals.filter((p) => p.status !== "SUPERSEDED").length
                return (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leaveType.colorHex }} />
                        <span className="font-medium text-gray-900">{r.leaveType.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      {fmt(r.startDate)}
                      {r.startDate !== r.endDate && ` – ${fmt(r.endDate)}`}
                      {r.isHalfDay && r.halfDayPeriod ? ` (${r.halfDayPeriod})` : ""}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-700">{r.totalDays}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}>
                        {r.status === "NEGOTIATING" ? "📬 Response needed" : r.status.toLowerCase()}
                      </span>
                      {r.status === "REJECTED" && r.rejectionReason && (
                        <div className="mt-1 text-xs text-gray-500 max-w-xs truncate" title={r.rejectionReason}>
                          “{r.rejectionReason}”
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {proposalCount > 0 ? (
                        <button
                          onClick={() => setThreadFor(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
                        >
                          <MessageSquare className="h-3 w-3" /> View thread ({proposalCount})
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <NewRequestModal
          leaveTypes={leaveTypes}
          initialStart={prefill?.start}
          initialEnd={prefill?.end}
          onClose={() => { setShowForm(false); setPrefill(null) }}
          onSubmitted={() => { setShowForm(false); setPrefill(null); loadAll() }}
        />
      )}
      {threadFor && (
        <ThreadModal
          request={threadFor}
          onClose={() => setThreadFor(null)}
          onChanged={() => { setThreadFor(null); loadAll() }}
        />
      )}
      {showLocation && (
        <WorkLocationModal onClose={() => setShowLocation(false)} onSubmitted={() => setShowLocation(false)} />
      )}
      {showSubscribe && (
        <SubscribeModal onClose={() => setShowSubscribe(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Calendar subscribe modal
// ---------------------------------------------------------------------------

function SubscribeModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch("/api/leave/calendar?subscribe=1")
      .then((r) => r.json())
      .then((data) => { setUrl(data.url); setBusy(false) })
      .catch(() => setBusy(false))
  }, [])

  async function copy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Subscribe in your calendar app</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <p className="text-gray-700">Paste this URL into Apple Calendar / Google Calendar / Outlook to keep your approved leaves in sync. Your calendar app re-fetches automatically.</p>
          {busy ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Generating…</div>
          ) : url ? (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={url} className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-mono" />
                <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
                  <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <a href={url} download="flux-leave.ics" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                <Download className="h-3.5 w-3.5" /> Or download the .ics file directly
              </a>
              <p className="text-xs text-gray-500">
                Treat this URL like a password — anyone with it can see your approved leaves. Generate a new one any time by re-opening this dialog (the old one expires automatically).
              </p>
            </>
          ) : (
            <p className="text-red-600">Failed to generate link. Try again.</p>
          )}
        </div>
        <div className="flex justify-end border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Work-location modal
// ---------------------------------------------------------------------------

function WorkLocationModal({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [locationType, setLocationType] = useState<"OFFICE" | "WFH" | "WFS">("OFFICE")
  const [skipWeekends, setSkipWeekends] = useState(true)
  const [locationName, setLocationName] = useState("")
  const [locationAddress, setLocationAddress] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Auto-pull endDate forward when the user picks a startDate after the
  // current end — saves a click in the common single-day case.
  function onStartChange(v: string) {
    setStartDate(v)
    if (endDate < v) setEndDate(v)
  }

  // Day count preview — purely cosmetic, server is the source of truth.
  const dayCount = (() => {
    if (!startDate || !endDate || endDate < startDate) return 0
    let n = 0
    const cur = new Date(startDate + "T00:00:00Z")
    const end = new Date(endDate + "T00:00:00Z")
    while (cur <= end) {
      const dow = cur.getUTCDay()
      const isWeekend = dow === 0 || dow === 6
      if (!skipWeekends || !isWeekend) n++
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return n
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const res = await fetch("/api/leave/work-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          skipWeekends,
          locationType,
          locationName: locationName || undefined,
          locationAddress: locationAddress || undefined,
          contactPhone: contactPhone || undefined,
          contactEmail: contactEmail || undefined,
          notes: notes || undefined,
        }),
      })
      if (!res.ok) { const d = await res.json(); setErr(d.error || "Failed"); return }
      onSubmitted()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Log work location</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start
              <input required type="date" value={startDate} onChange={(e) => onStartChange(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">End
              <input required type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type
              <select value={locationType} onChange={(e) => setLocationType(e.target.value as "OFFICE" | "WFH" | "WFS")} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="OFFICE">Office</option>
                <option value="WFH">Work from home</option>
                <option value="WFS">Off-site / customer</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-1.5 text-gray-700">
              <input type="checkbox" checked={skipWeekends} onChange={(e) => setSkipWeekends(e.target.checked)} />
              Skip weekends
            </label>
            <span className={dayCount === 0 ? "text-red-600" : "text-gray-500"}>
              {dayCount} {dayCount === 1 ? "day" : "days"} will be logged
            </span>
          </div>
          {locationType !== "OFFICE" && (
            <>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Location name (optional)
                <input value={locationName} onChange={(e) => setLocationName(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Customer office, café, etc." />
              </label>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Address (optional)
                <input value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contact phone
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Contact email
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                </label>
              </div>
            </>
          )}
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">Notes (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
          <button type="submit" disabled={busy || dayCount === 0} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {dayCount > 1 ? `Log ${dayCount} days` : "Log location"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New request modal
// ---------------------------------------------------------------------------

function NewRequestModal({ leaveTypes, initialStart, initialEnd, onClose, onSubmitted }: { leaveTypes: LeaveType[]; initialStart?: string; initialEnd?: string; onClose: () => void; onSubmitted: () => void }) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "")
  const [startDate, setStartDate] = useState(initialStart ?? "")
  const [endDate, setEndDate] = useState(initialEnd ?? "")
  const [isHalfDay, setIsHalfDay] = useState(false)
  const [halfDayPeriod, setHalfDayPeriod] = useState<"AM" | "PM">("AM")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pull holidays for the years touched so we can show a live working-day
  // preview as the user picks dates. Same logic as the server.
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set())
  const start = startDate ? new Date(`${startDate}T00:00:00Z`) : null
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : (isHalfDay ? start : null)
  const yearsNeeded = useMemo(() => {
    const ys = new Set<number>()
    if (start) ys.add(start.getUTCFullYear())
    if (end) ys.add(end.getUTCFullYear())
    return Array.from(ys)
  }, [start, end])
  useEffect(() => {
    if (yearsNeeded.length === 0) return
    let cancelled = false
    Promise.all(
      yearsNeeded.map((y) => fetch(`/api/leave/holidays?year=${y}`).then((r) => r.json()))
    ).then((results) => {
      if (cancelled) return
      const set = new Set<string>()
      for (const data of results) {
        for (const h of (data.holidays ?? [])) {
          set.add(String(h.date).slice(0, 10))
        }
      }
      setHolidayDates(set)
    })
    return () => { cancelled = true }
  }, [yearsNeeded.join(",")]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    if (!start || !end || end < start) return null
    if (isHalfDay) return { workingDays: 0.5, weekendsSkipped: 0, holidaysSkipped: 0 }
    let working = 0
    let weekendsSkipped = 0
    let holidaysSkipped = 0
    const cur = new Date(start)
    while (cur <= end) {
      const dow = cur.getUTCDay()
      const key = cur.toISOString().slice(0, 10)
      const isWeekend = dow === 0 || dow === 6
      const isHoliday = holidayDates.has(key)
      if (isWeekend) weekendsSkipped++
      else if (isHoliday) holidaysSkipped++
      else working++
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return { workingDays: working, weekendsSkipped, holidaysSkipped }
  }, [start, end, isHalfDay, holidayDates])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        leaveTypeId,
        startDate,
        endDate: isHalfDay ? startDate : endDate,
        isHalfDay,
        reason: reason.trim() || undefined,
      }
      if (isHalfDay) body.halfDayPeriod = halfDayPeriod
      const res = await fetch("/api/leave/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Failed to submit")
        return
      }
      onSubmitted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">New leave request</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Leave type</span>
            <select
              required
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Start date</span>
              <input
                required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className={isHalfDay ? "opacity-40 pointer-events-none" : ""}>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">End date</span>
              <input
                required={!isHalfDay} type="date" value={isHalfDay ? startDate : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isHalfDay} onChange={(e) => setIsHalfDay(e.target.checked)} />
            <span className="text-sm text-gray-700">Half day only</span>
            {isHalfDay && (
              <select
                value={halfDayPeriod}
                onChange={(e) => setHalfDayPeriod(e.target.value as "AM" | "PM")}
                className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option>AM</option><option>PM</option>
              </select>
            )}
          </label>

          {preview && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900">
              <div>
                <strong>{preview.workingDays}</strong> working day{preview.workingDays === 1 ? "" : "s"} will be deducted.
              </div>
              {(preview.weekendsSkipped > 0 || preview.holidaysSkipped > 0) && (
                <div className="mt-0.5 text-blue-700">
                  Skipped: {preview.weekendsSkipped > 0 && `${preview.weekendsSkipped} weekend day${preview.weekendsSkipped === 1 ? "" : "s"}`}
                  {preview.weekendsSkipped > 0 && preview.holidaysSkipped > 0 && " · "}
                  {preview.holidaysSkipped > 0 && `${preview.holidaysSkipped} public holiday${preview.holidaysSkipped === 1 ? "" : "s"}`}
                </div>
              )}
              {preview.workingDays === 0 && (
                <div className="mt-0.5 text-red-700">No working days in the selected range.</div>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reason (optional)</span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
          <button
            type="submit" disabled={busy || !leaveTypeId || !startDate || (!isHalfDay && !endDate)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Submit for approval
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Proposal thread modal
// ---------------------------------------------------------------------------

function ThreadModal({ request, onClose, onChanged }: { request: LeaveRequest; onClose: () => void; onChanged: () => void }) {
  const activeProposal = request.proposals.find((p) => p.status === "PENDING")
  const myTurn = activeProposal?.proposerRole === "SUPERVISOR"
  const [counter, setCounter] = useState({ open: false, start: "", end: "", message: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function agree() {
    if (!activeProposal) return
    setBusy(true)
    try {
      const res = await fetch(`/api/leave/proposal/${activeProposal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "AGREE" }),
      })
      if (!res.ok) {
        const d = await res.json(); setError(d.error || "Failed"); return
      }
      onChanged()
    } finally { setBusy(false) }
  }

  async function sendCounter(e: React.FormEvent) {
    e.preventDefault()
    if (counter.message.trim().length < 20) return
    setBusy(true); setError(null)
    try {
      // Mark current proposal as DISAGREED, then post a new counter.
      if (activeProposal) {
        await fetch(`/api/leave/proposal/${activeProposal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DISAGREE", responseNote: counter.message.trim() }),
        })
      }
      const res = await fetch(`/api/leave/request/${request.id}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedStart: counter.start,
          proposedEnd: counter.end,
          message: counter.message.trim(),
        }),
      })
      if (!res.ok) {
        const d = await res.json(); setError(d.error || "Failed"); return
      }
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="font-semibold text-gray-900">Negotiation thread</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-5 max-h-[50vh] overflow-y-auto">
          <ThreadEntry side="left" who="You requested" date={request.createdAt} dates={`${fmt(request.startDate)} – ${fmt(request.endDate)}`} days={request.totalDays} message={request.reason || ""} />
          {request.proposals.map((p) => (
            <ThreadEntry
              key={p.id}
              side={p.proposerRole === "SUPERVISOR" ? "left" : "right"}
              who={p.proposerRole === "SUPERVISOR" ? `${request.supervisor.name ?? "Supervisor"} proposed` : "You suggested"}
              date={p.createdAt}
              dates={`${fmt(p.proposedStart)} – ${fmt(p.proposedEnd)}`}
              days={p.proposedDays}
              message={p.message}
              statusBadge={p.status !== "PENDING" ? p.status.toLowerCase() : undefined}
            />
          ))}
        </div>

        {myTurn && activeProposal && !counter.open && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-orange-50 px-5 py-3">
            <p className="text-sm text-orange-900">Your supervisor is waiting for a response.</p>
            <div className="flex gap-2">
              <button onClick={agree} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                <CheckCircle2 className="h-3.5 w-3.5" /> Accept dates
              </button>
              <button onClick={() => setCounter({ open: true, start: activeProposal.proposedStart.slice(0, 10), end: activeProposal.proposedEnd.slice(0, 10), message: "" })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-white">
                Suggest different dates
              </button>
            </div>
          </div>
        )}

        {counter.open && (
          <form onSubmit={sendCounter} className="space-y-3 border-t border-gray-200 p-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">Start
                <input required type="date" value={counter.start} onChange={(e) => setCounter((c) => ({ ...c, start: e.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-gray-500">End
                <input required type="date" value={counter.end} onChange={(e) => setCounter((c) => ({ ...c, end: e.target.value }))} className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </label>
            </div>
            <textarea required minLength={20} maxLength={2000} rows={3} value={counter.message} onChange={(e) => setCounter((c) => ({ ...c, message: e.target.value }))} placeholder="Why these dates? (≥20 chars)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            {error && <div className="text-xs text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCounter({ ...counter, open: false })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
              <button type="submit" disabled={busy || counter.message.trim().length < 20} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">Send counter-proposal</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ThreadEntry({ side, who, date, dates, days, message, statusBadge }: { side: "left" | "right"; who: string; date: string; dates: string; days: number; message: string; statusBadge?: string }) {
  const accent = side === "left" ? "border-blue-300 bg-blue-50/60" : "border-indigo-300 bg-indigo-50/60"
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-md rounded-xl border-l-4 ${accent} p-3`}>
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="font-medium text-gray-800">{who}</span>
          <span>{new Date(date).toLocaleString()}</span>
        </div>
        <div className="mt-1 text-sm text-gray-900">{dates} ({days} {days === 1 ? "day" : "days"})</div>
        {message && <div className="mt-1 text-sm text-gray-700 italic">“{message}”</div>}
        {statusBadge && <div className="mt-1 text-xs text-gray-500 line-through">{statusBadge}</div>}
      </div>
    </div>
  )
}
