"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

// Google-style calendar embedded into the employee leave page.
//   - Month view: classic 7-col grid, current month highlighted, other-month
//     days dimmed, weekends shaded.
//   - Week view: a single row spanning the visible week.
//   - Click a day to open a side panel listing every event on that day.
//   - Click an event chip to open the same panel pre-scrolled to it.
//
// Sources unified into one CalEvent[]:
//   - Public holidays (red, country-tagged)
//   - Company / special events (admin-managed, custom colour)
//   - Caller's own approved leaves (leave-type colour)

type Source = "HOLIDAY" | "EVENT" | "LEAVE"
type CalEvent = {
  id: string
  source: Source
  title: string
  description?: string | null
  start: Date
  end: Date // inclusive — UI handles spanning
  allDay: boolean
  colorHex: string
  category?: string
  location?: string
  status?: string
}

type View = "month" | "week" | "year"

function ymd(d: Date) { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}
function startOfMonth(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
function startOfWeek(d: Date) {
  // Week starts Monday for our org defaults; if you want Sunday, shift by 1.
  const day = d.getUTCDay() // 0=Sun
  const offset = (day + 6) % 7 // Mon=0, Sun=6
  return addDays(d, -offset)
}
// Pin to en-GB so server (Node) and client (browser) render the same
// strings — avoids the React hydration mismatch you'd otherwise hit when
// Node's default locale differs from the browser's.
function fmt(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}
function sameUtcDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate()
}
function isWeekend(d: Date) { const dow = d.getUTCDay(); return dow === 0 || dow === 6 }

interface LeaveCalendarProps {
  /**
   * Fired when the user drags a range across days (Google Calendar style).
   * Both dates are UTC midnight; the range is inclusive on both ends.
   */
  onRangeCreate?: (start: Date, end: Date) => void
  /**
   * Increment in the parent to force the calendar to re-fetch (e.g. after
   * a leave is cancelled or a new request is submitted).
   */
  refreshKey?: number
  /**
   * Called after the user cancels a leave from the calendar's day-detail
   * panel — parent should refresh other dependent state (balances, history).
   */
  onLeaveChanged?: () => void
  /**
   * "mine" → caller's own approved + pending leaves (default, employee view).
   * "to-approve" → leaves for the caller's direct reports (supervisor view).
   */
  scope?: "mine" | "to-approve"
}

export function LeaveCalendar({ onRangeCreate, refreshKey = 0, onLeaveChanged, scope = "mine" }: LeaveCalendarProps = {}) {
  const [view, setView] = useState<View>("month")
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [openDay, setOpenDay] = useState<Date | null>(null)
  const [filter, setFilter] = useState<Record<Source, boolean>>({ HOLIDAY: true, EVENT: true, LEAVE: true })

  // Drag-selection state. dragStart marks the cell the user pressed on;
  // dragCurrent updates as they move into other cells. dragMoved disambiguates
  // a true drag from a click (which still opens the day-detail panel).
  const [dragStart, setDragStart] = useState<Date | null>(null)
  const [dragCurrent, setDragCurrent] = useState<Date | null>(null)
  const [dragMoved, setDragMoved] = useState(false)

  const range = useMemo(() => computeRange(view, anchor), [view, anchor])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const from = ymd(range.gridStart)
    const to = ymd(range.gridEnd)
    const yearsToFetch = new Set<number>()
    for (let d = new Date(range.gridStart); d <= range.gridEnd; d = addDays(d, 1)) {
      yearsToFetch.add(d.getUTCFullYear())
    }
    Promise.all([
      Promise.all(Array.from(yearsToFetch).map((y) => fetch(`/api/leave/holidays?year=${y}`).then((r) => r.json()))),
      fetch(`/api/leave/events?from=${from}&to=${to}`).then((r) => r.json()),
      fetch(`/api/leave/request?scope=${scope}&from=${from}&to=${to}`).then((r) => r.json()),
    ])
      .then(([holidayResults, eventsRes, leavesRes]) => {
        if (cancelled) return
        const out: CalEvent[] = []
        for (const data of holidayResults) {
          for (const h of (data.holidays ?? [])) {
            const d = new Date(h.date)
            out.push({
              id: `h-${h.id}`,
              source: "HOLIDAY",
              title: h.name,
              description: `${h.type ?? "Holiday"} · ${h.countryCode}`,
              start: d,
              end: d,
              allDay: true,
              colorHex: "#EF4444",
              category: h.type,
            })
          }
        }
        for (const e of (eventsRes.events ?? [])) {
          out.push({
            id: `e-${e.id}`,
            source: "EVENT",
            title: e.title,
            description: e.description,
            start: new Date(e.startDate),
            end: new Date(e.endDate),
            allDay: e.allDay,
            colorHex: e.colorHex || "#22D3EE",
            category: e.category,
            location: e.location,
          })
        }
        for (const r of (leavesRes.requests ?? [])) {
          // Show APPROVED + PENDING + NEGOTIATING so users see what's still
          // awaiting a decision, alongside what's confirmed. REJECTED /
          // CANCELLED are noise — skip them.
          if (!["APPROVED", "PENDING", "NEGOTIATING"].includes(r.status)) continue
          const empName = r.employee?.name ?? r.employee?.email ?? null
          const titleSuffix = r.isHalfDay ? ` (${r.halfDayPeriod})` : ""
          // Supervisor view prefixes the employee's name; employee view doesn't
          // because it's their own and would feel redundant.
          const chipTitle = scope === "to-approve" && empName
            ? `${empName} · ${r.leaveType.name}${titleSuffix}`
            : `${r.leaveType.name}${titleSuffix}`
          out.push({
            id: `l-${r.id}`,
            source: "LEAVE",
            title: chipTitle,
            description: scope === "to-approve" && empName
              ? `${empName}\n${r.reason ?? ""}`.trim()
              : r.reason,
            start: new Date(r.startDate),
            end: new Date(r.endDate),
            allDay: !r.isHalfDay,
            colorHex: r.leaveType.colorHex || "#10B981",
            status: r.status,
          })
        }
        setEvents(out)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range.gridStart.getTime(), range.gridEnd.getTime(), refreshKey, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const out: Date[] = []
    for (let d = new Date(range.gridStart); d <= range.gridEnd; d = addDays(d, 1)) out.push(new Date(d))
    return out
  }, [range.gridStart, range.gridEnd])

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) {
      if (!filter[e.source]) continue
      // Walk the event's span and add to each day inside the visible range.
      let cur = new Date(Date.UTC(e.start.getUTCFullYear(), e.start.getUTCMonth(), e.start.getUTCDate()))
      const last = new Date(Date.UTC(e.end.getUTCFullYear(), e.end.getUTCMonth(), e.end.getUTCDate()))
      while (cur <= last) {
        const k = ymd(cur)
        const arr = m.get(k) ?? []
        arr.push(e)
        m.set(k, arr)
        cur = addDays(cur, 1)
      }
    }
    return m
  }, [events, filter])

  function shift(delta: number) {
    setAnchor((prev) => {
      if (view === "year") {
        return new Date(Date.UTC(prev.getUTCFullYear() + delta, 0, 1))
      }
      if (view === "month") {
        return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + delta, 1))
      }
      return addDays(prev, delta * 7)
    })
  }

  // Globally listen for mouseup / touchend so a drag that ends outside the
  // grid still resolves cleanly. ESC cancels.
  // Touch: we attach touchmove to document so we can hit-test the cell under
  // the finger via document.elementFromPoint — touchenter doesn't bubble.
  useEffect(() => {
    if (!dragStart) return
    function finalize() {
      if (!dragStart) return
      const a = dragStart!
      const b = dragCurrent ?? dragStart!
      const start = a <= b ? a : b
      const end = a <= b ? b : a
      if (dragMoved && onRangeCreate) {
        onRangeCreate(start, end)
      } else if (!dragMoved) {
        setOpenDay(a)
      }
      setDragStart(null)
      setDragCurrent(null)
      setDragMoved(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDragStart(null); setDragCurrent(null); setDragMoved(false)
      }
    }
    function onTouchMove(e: TouchEvent) {
      if (!dragStart) return
      const t = e.touches[0]
      if (!t) return
      const target = document.elementFromPoint(t.clientX, t.clientY)
      const cell = target?.closest<HTMLElement>("[data-cal-day]")
      if (!cell) return
      const ymdStr = cell.dataset.calDay
      if (!ymdStr) return
      // Prevent the page from scrolling while dragging across days.
      e.preventDefault()
      const [y, m, day] = ymdStr.split("-").map(Number)
      const next = new Date(Date.UTC(y, m - 1, day))
      if (!sameUtcDay(next, dragStart!)) setDragMoved(true)
      setDragCurrent(next)
    }
    document.addEventListener("mouseup", finalize)
    document.addEventListener("touchend", finalize)
    document.addEventListener("touchcancel", finalize)
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mouseup", finalize)
      document.removeEventListener("touchend", finalize)
      document.removeEventListener("touchcancel", finalize)
      document.removeEventListener("touchmove", onTouchMove)
      document.removeEventListener("keydown", onKey)
    }
  }, [dragStart, dragCurrent, dragMoved, onRangeCreate])

  // Whether a given day falls inside the active drag selection.
  function isInDragRange(d: Date): boolean {
    if (!dragStart) return false
    const cur = dragCurrent ?? dragStart
    const lo = dragStart <= cur ? dragStart : cur
    const hi = dragStart <= cur ? cur : dragStart
    return d >= lo && d <= hi
  }

  function FilterChip({ source, label }: { source: Source; label: string }) {
    const colors = source === "HOLIDAY" ? "border-red-200 bg-red-50 text-red-800"
      : source === "EVENT" ? "border-cyan-200 bg-cyan-50 text-cyan-800"
      : "border-green-200 bg-green-50 text-green-800"
    return (
      <button
        onClick={() => setFilter((f) => ({ ...f, [source]: !f[source] }))}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
          filter[source] ? colors : "border-gray-200 bg-gray-50 text-gray-400 line-through"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${
          source === "HOLIDAY" ? "bg-red-500" : source === "EVENT" ? "bg-cyan-500" : "bg-green-500"
        }`} /> {label}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setAnchor(new Date())} className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50">Today</button>
          <button onClick={() => shift(1)} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          <h3 className="ml-2 text-base font-semibold text-gray-900">
            {view === "year"
              ? anchor.getUTCFullYear()
              : view === "month"
                ? fmtMonthYear(anchor)
                : `${fmt(range.gridStart)} – ${fmt(range.gridEnd)}`}
          </h3>
          {loading && <span className="text-xs text-gray-400">loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <FilterChip source="HOLIDAY" label="Holidays" />
          <FilterChip source="EVENT" label="Company" />
          <FilterChip source="LEAVE" label={scope === "to-approve" ? "Team leave" : "My leave"} />
          <div className="ml-2 inline-flex rounded-lg border border-gray-300 p-0.5">
            <button onClick={() => setView("week")}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === "week" ? "bg-[#0B1E3F] text-white" : "text-gray-600"}`}>Week</button>
            <button onClick={() => setView("month")}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === "month" ? "bg-[#0B1E3F] text-white" : "text-gray-600"}`}>Month</button>
            <button onClick={() => setView("year")}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === "year" ? "bg-[#0B1E3F] text-white" : "text-gray-600"}`}>Year</button>
          </div>
        </div>
      </div>

      {view !== "year" && (
        <div className="grid grid-cols-7 border-b border-gray-200 text-xs font-medium text-gray-500">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => (
            <div key={w} className="px-2 py-2 text-center">{w}</div>
          ))}
        </div>
      )}

      {view === "year" && (
        <YearGrid
          year={anchor.getUTCFullYear()}
          eventsByDay={eventsByDay}
          onPickDay={(d) => setOpenDay(d)}
          onPickMonth={(m) => {
            setAnchor(new Date(Date.UTC(anchor.getUTCFullYear(), m, 1)))
            setView("month")
          }}
        />
      )}

      {view !== "year" && <div
        className={`grid grid-cols-7 divide-x divide-y divide-gray-100 ${dragStart ? "select-none cursor-cell" : ""}`}
      >
        {days.map((d) => {
          const k = ymd(d)
          const isCurrentMonth = view !== "month" || d.getUTCMonth() === anchor.getUTCMonth()
          const isToday = sameUtcDay(d, new Date())
          const evts = eventsByDay.get(k) ?? []
          const inDrag = isInDragRange(d)
          return (
            <div
              key={k}
              role="button"
              tabIndex={0}
              data-cal-day={k}
              onMouseDown={(e) => {
                if (e.button !== 0) return
                // No drag-to-create handler? Skip drag entirely — clicks still
                // land via the global mouseup → setOpenDay path below.
                if (!onRangeCreate) {
                  setOpenDay(d)
                  return
                }
                setDragStart(d)
                setDragCurrent(d)
                setDragMoved(false)
              }}
              onMouseEnter={() => {
                if (!dragStart || !onRangeCreate) return
                if (!sameUtcDay(d, dragStart)) setDragMoved(true)
                setDragCurrent(d)
              }}
              onTouchStart={() => {
                if (!onRangeCreate) {
                  setOpenDay(d)
                  return
                }
                setDragStart(d)
                setDragCurrent(d)
                setDragMoved(false)
              }}
              className={`group min-h-[96px] text-left p-1.5 transition-colors ${
                isCurrentMonth ? "bg-white" : "bg-gray-50/60 text-gray-400"
              } ${isWeekend(d) && isCurrentMonth ? "bg-gray-50/40" : ""} ${
                inDrag ? "bg-blue-100/70 ring-1 ring-inset ring-blue-300" : "hover:bg-blue-50/40"
              }`}
            >
              <div className={`mb-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                isToday ? "bg-[#0B1E3F] text-white" : ""
              }`}>{d.getUTCDate()}</div>
              <div className="space-y-0.5">
                {evts.slice(0, view === "week" ? 8 : 3).map((e, i) => {
                  const pending = e.status === "PENDING" || e.status === "NEGOTIATING"
                  return (
                    <div
                      key={`${e.id}-${i}`}
                      title={`${e.title}${pending ? ` (${e.status?.toLowerCase()})` : ""}`}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setOpenDay(d)
                      }}
                      className="truncate rounded px-1.5 py-0.5 text-[11px] leading-tight cursor-pointer hover:brightness-95"
                      style={
                        pending
                          ? {
                              background: "transparent",
                              color: e.colorHex,
                              border: `1px dashed ${e.colorHex}88`,
                            }
                          : {
                              background: `${e.colorHex}22`,
                              color: e.colorHex,
                              border: `1px solid ${e.colorHex}44`,
                            }
                      }
                    >
                      {pending ? "⏳ " : ""}{e.title}
                    </div>
                  )
                })}
                {evts.length > (view === "week" ? 8 : 3) && (
                  <div className="text-[10px] text-gray-500 pointer-events-none">+{evts.length - (view === "week" ? 8 : 3)} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>}

      {dragStart && onRangeCreate && (
        <div className="border-t border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
          Drag across days to request leave · release on the same day to view details · ESC to cancel
        </div>
      )}

      {openDay && (
        <DayDetail
          date={openDay}
          events={eventsByDay.get(ymd(openDay)) ?? []}
          allowCancel={scope === "mine"}
          allowApprove={scope === "to-approve"}
          onClose={() => setOpenDay(null)}
          onChanged={() => {
            // Don't close — let the events prop refresh so the supervisor can
            // act on multiple leaves on the same day without reopening.
            onLeaveChanged?.()
          }}
        />
      )}
    </div>
  )
}

function DayDetail({ date, events, onClose, onChanged, allowCancel, allowApprove }: { date: Date; events: CalEvent[]; onClose: () => void; onChanged: () => void; allowCancel: boolean; allowApprove: boolean }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errId, setErrId] = useState<{ id: string; msg: string } | null>(null)
  const [rejectFor, setRejectFor] = useState<string | null>(null) // request id awaiting reason
  const [rejectReason, setRejectReason] = useState("")

  function requestIdOf(e: CalEvent): string | null {
    return e.id.startsWith("l-") ? e.id.slice(2) : null
  }

  async function cancelLeave(e: CalEvent) {
    const requestId = requestIdOf(e)
    if (!requestId) return
    if (!confirm(`Cancel "${e.title}"? This can't be undone — submit a new request if you change your mind.`)) return
    setBusyId(e.id); setErrId(null)
    try {
      const res = await fetch(`/api/leave/request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CANCEL" }),
      })
      const data = await res.json()
      if (!res.ok) { setErrId({ id: e.id, msg: data.error || "Failed to cancel" }); return }
      onChanged()
    } finally { setBusyId(null) }
  }

  async function approveLeave(e: CalEvent) {
    const requestId = requestIdOf(e)
    if (!requestId) return
    setBusyId(e.id); setErrId(null)
    try {
      const res = await fetch(`/api/leave/request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      })
      const data = await res.json()
      if (!res.ok) { setErrId({ id: e.id, msg: data.error || "Failed to approve" }); return }
      onChanged()
    } finally { setBusyId(null) }
  }

  async function submitReject(e: CalEvent) {
    const requestId = requestIdOf(e)
    if (!requestId) return
    if (rejectReason.trim().length < 20) {
      setErrId({ id: e.id, msg: "Reason must be at least 20 characters" })
      return
    }
    setBusyId(e.id); setErrId(null)
    try {
      const res = await fetch(`/api/leave/request/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejectionReason: rejectReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setErrId({ id: e.id, msg: data.error || "Failed to reject" }); return }
      // Clear the form before parent re-fetches so the next pending leave
      // on this day comes up with fresh state.
      setRejectFor(null)
      setRejectReason("")
      onChanged()
    } finally { setBusyId(null) }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/30"
      onClick={(e) => {
        // Click on the backdrop (not the panel) closes — matches Google
        // Calendar's quick-event popover.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">{date.toLocaleDateString("en-GB", { weekday: "long" })}</div>
            <h3 className="text-lg font-semibold text-gray-900">{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No events on this day.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((e, i) => {
                // Approved leaves can't be cancelled by the employee via this
                // route — the API rejects anything outside PENDING/NEGOTIATING.
                // Supervisor view never shows cancel; employees can only cancel
                // their own (allowCancel=true means the calendar is in "mine" scope).
                const isCancellable = allowCancel && e.source === "LEAVE" && (e.status === "PENDING" || e.status === "NEGOTIATING")
                const isApprovable = allowApprove && e.source === "LEAVE" && (e.status === "PENDING" || e.status === "NEGOTIATING")
                const requestId = requestIdOf(e)
                const rejectingMe = rejectFor === requestId
                return (
                  <li key={`${e.id}-${i}`} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.colorHex }} />
                      <span className="text-xs uppercase tracking-wider text-gray-500">{labelForSource(e)}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{e.title}</div>
                    {e.description && <div className="mt-1 text-sm text-gray-600 whitespace-pre-line">{e.description}</div>}
                    {e.location && <div className="mt-1 text-xs text-gray-500">📍 {e.location}</div>}
                    {!sameUtcDay(e.start, e.end) && (
                      <div className="mt-1 text-xs text-gray-500">{fmt(e.start)} → {fmt(e.end)}</div>
                    )}
                    {e.allDay ? null : (
                      <div className="mt-1 text-xs text-gray-500">
                        {e.start.toUTCString().slice(17, 22)}–{e.end.toUTCString().slice(17, 22)} UTC
                      </div>
                    )}
                    {isCancellable && (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        {errId?.id === e.id && (
                          <span className="text-xs text-red-600">{errId.msg}</span>
                        )}
                        <button
                          onClick={() => cancelLeave(e)}
                          disabled={busyId === e.id}
                          className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busyId === e.id ? "Cancelling…" : "Cancel request"}
                        </button>
                      </div>
                    )}
                    {isApprovable && !rejectingMe && (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        {errId?.id === e.id && (
                          <span className="text-xs text-red-600">{errId.msg}</span>
                        )}
                        <button
                          onClick={() => approveLeave(e)}
                          disabled={busyId === e.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {busyId === e.id ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => { setRejectFor(requestId); setRejectReason(""); setErrId(null) }}
                          disabled={busyId === e.id}
                          className="rounded-lg border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject…
                        </button>
                      </div>
                    )}
                    {isApprovable && rejectingMe && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          required
                          minLength={20}
                          maxLength={2000}
                          rows={3}
                          value={rejectReason}
                          onChange={(ev) => setRejectReason(ev.target.value)}
                          placeholder="Reason for rejection (≥20 chars). The employee will see this exactly."
                          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-200"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-gray-500">{rejectReason.trim().length} / 20 minimum</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setRejectFor(null); setErrId(null) }}
                              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50"
                            >
                              Back
                            </button>
                            <button
                              onClick={() => submitReject(e)}
                              disabled={busyId === e.id || rejectReason.trim().length < 20}
                              className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {busyId === e.id ? "…" : "Send rejection"}
                            </button>
                          </div>
                        </div>
                        {errId?.id === e.id && (
                          <div className="text-xs text-red-600">{errId.msg}</div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Year view: 12 mini-month grids in a 4×3 layout (matching Google Calendar's
// year mode). Each day shows up to 3 colored dots — one per source category
// present on that day. Click a day to open the standard day-detail panel;
// click a month name to jump into Month view for that month.
// ---------------------------------------------------------------------------

function YearGrid({
  year,
  eventsByDay,
  onPickDay,
  onPickMonth,
}: {
  year: number
  eventsByDay: Map<string, CalEvent[]>
  onPickDay: (d: Date) => void
  onPickMonth: (monthIndex: number) => void
}) {
  const months = Array.from({ length: 12 }, (_, m) => m)
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((m) => (
        <MiniMonth
          key={m}
          year={year}
          month={m}
          eventsByDay={eventsByDay}
          onPickDay={onPickDay}
          onPickMonth={() => onPickMonth(m)}
        />
      ))}
    </div>
  )
}

function MiniMonth({
  year,
  month,
  eventsByDay,
  onPickDay,
  onPickMonth,
}: {
  year: number
  month: number
  eventsByDay: Map<string, CalEvent[]>
  onPickDay: (d: Date) => void
  onPickMonth: () => void
}) {
  const first = new Date(Date.UTC(year, month, 1))
  const start = startOfWeek(first)
  // 6 weeks * 7 days = 42 cells, same as month view.
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i))
  const monthName = first.toLocaleDateString(undefined, { month: "long" })
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        onClick={onPickMonth}
        className="w-full border-b border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-700 hover:bg-gray-50"
      >
        {monthName}
      </button>
      <div className="grid grid-cols-7 px-2 pt-1.5 text-[10px] text-gray-400">
        {["M","T","W","T","F","S","S"].map((w, i) => (
          <div key={i} className="px-0.5 text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px p-2">
        {cells.map((d) => {
          const inMonth = d.getUTCMonth() === month
          const isToday = sameUtcDay(d, new Date())
          const evts = inMonth ? (eventsByDay.get(ymd(d)) ?? []) : []
          // Surface up to 3 colour dots — dedup by source so we don't show
          // 4 holiday dots when there's a single multi-day company event.
          const seen = new Set<string>()
          const dots: { color: string; key: string }[] = []
          for (const e of evts) {
            const k = `${e.source}:${e.colorHex}`
            if (seen.has(k)) continue
            seen.add(k)
            dots.push({ color: e.colorHex, key: k })
            if (dots.length === 3) break
          }
          return (
            <button
              key={ymd(d)}
              onClick={() => inMonth && onPickDay(d)}
              disabled={!inMonth}
              className={`flex aspect-square flex-col items-center justify-start rounded text-[10px] ${
                inMonth ? "hover:bg-blue-50 cursor-pointer" : "text-gray-300 cursor-default"
              }`}
            >
              <span className={`mt-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 ${
                isToday ? "bg-[#0B1E3F] text-white" : ""
              }`}>{d.getUTCDate()}</span>
              {dots.length > 0 && (
                <span className="mt-0.5 inline-flex gap-0.5">
                  {dots.map((dot) => (
                    <span key={dot.key} className="h-1 w-1 rounded-full" style={{ background: dot.color }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function labelForSource(e: CalEvent): string {
  if (e.source === "HOLIDAY") return e.category ? `Holiday · ${e.category}` : "Holiday"
  if (e.source === "LEAVE") {
    if (e.status === "PENDING") return "Leave · awaiting approval"
    if (e.status === "NEGOTIATING") return "Leave · supervisor proposed dates"
    return "Leave · approved"
  }
  return e.category ? `${e.category}` : "Company event"
}

function computeRange(view: View, anchor: Date): { gridStart: Date; gridEnd: Date } {
  if (view === "week") {
    const start = startOfWeek(anchor)
    return { gridStart: start, gridEnd: addDays(start, 6) }
  }
  if (view === "year") {
    // Whole calendar year — Jan 1 → Dec 31, padded to whole weeks for the
    // mini-month grids.
    const yearStart = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1))
    const yearEnd = new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31))
    const start = startOfWeek(yearStart)
    // Pad to the end of the last visible week.
    const dec31Week = startOfWeek(yearEnd)
    const end = addDays(dec31Week, 6)
    return { gridStart: start, gridEnd: end }
  }
  const first = startOfMonth(anchor)
  const start = startOfWeek(first)
  // Always render 6 weeks for a stable grid (Google Calendar does the same).
  const end = addDays(start, 6 * 7 - 1)
  return { gridStart: start, gridEnd: end }
}
