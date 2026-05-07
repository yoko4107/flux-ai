"use client"

import { useEffect, useState } from "react"
import { Loader2, Plane, X, CheckCircle2, XCircle, Banknote } from "lucide-react"

// Display overrides for destination country codes — keeps the UI consistent
// with the employee + dashboard side ("SA" renders as "KSA").
const COUNTRY_LABEL: Record<string, string> = {
  SA: "KSA",
}
function fmtCountry(cc: string): string {
  return COUNTRY_LABEL[cc] ?? cc
}

/** YYYY-MM-DD or ISO timestamp → DD/MM/YYYY. */
function fmtDate(input: string | null | undefined): string {
  if (!input) return ""
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : input
}

function hasWirePayout(r: {
  payoutCurrency: string | null
  payoutAccountHolder: string | null
  payoutAccountNumber: string | null
  payoutBankName: string | null
  payoutBankAddress: string | null
  payoutSwiftCode: string | null
  payoutRoutingNumber: string | null
  payoutNotes: string | null
}): boolean {
  return !!(
    r.payoutCurrency || r.payoutAccountHolder || r.payoutAccountNumber ||
    r.payoutBankName || r.payoutBankAddress || r.payoutSwiftCode ||
    r.payoutRoutingNumber || r.payoutNotes
  )
}

type PerDiemRequest = {
  id: string
  destinationCountry: string
  destinationCity: string | null
  isHighCost: boolean
  startDate: string
  endDate: string
  totalDays: number
  currency: string
  exchangeRate: string
  totalAmount: string
  totalAmountUSD: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  reason: string | null
  payoutCurrency: string | null
  payoutAccountHolder: string | null
  payoutAccountNumber: string | null
  payoutBankName: string | null
  payoutBankAddress: string | null
  payoutSwiftCode: string | null
  payoutRoutingNumber: string | null
  payoutNotes: string | null
  category: string | null
  items?: {
    id: string
    category: string
    description: string
    amount: string | null
    amountUSD: string | null
    date: string | null
    createdAt: string
  }[]
  createdAt: string
  employee: { id: string; name: string | null; email: string | null }
  days: {
    id: string
    date: string
    baseRate: string
    baseRateUSD: string
    isTravelDay: boolean
    breakfastProvided: boolean
    lunchProvided: boolean
    dinnerProvided: boolean
    dailyTotal: string
    dailyTotalUSD: string
    isOverride: boolean
  }[]
}

const STATUS_COLOR: Record<PerDiemRequest["status"], string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
}

export default function ApproverPerDiemPage() {
  const [requests, setRequests] = useState<PerDiemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"pending" | "all">("pending")
  const [rejectFor, setRejectFor] = useState<PerDiemRequest | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const data = await fetch("/api/per-diem/request?scope=to-approve").then((r) => r.json())
    setRequests(data.requests ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = requests.filter((r) => tab === "pending" ? r.status === "PENDING" : true)

  async function approve(r: PerDiemRequest) {
    await fetch(`/api/per-diem/request/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    })
    load()
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Per Diem Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Review and decide your team's business travel claims.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === t ? "border-[#0B1E3F] text-[#0B1E3F]" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t === "pending" ? "Pending" : "All"}
            {t === "pending" && (
              <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                {requests.filter((r) => r.status === "PENDING").length}
              </span>
            )}
          </button>
        ))}
        {loading && <Loader2 className="ml-3 h-4 w-4 animate-spin self-center text-gray-400" />}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <Plane className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">Nothing here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const where = r.destinationCity ? `${r.destinationCity}, ${fmtCountry(r.destinationCountry)}` : fmtCountry(r.destinationCountry)
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{r.employee.name ?? r.employee.email}</span>
                      <span className="text-sm text-gray-500">· {where}</span>
                      {r.isHighCost && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">High-cost</span>}
                      {r.category && r.category !== "BUSINESS_TRAVEL" && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">
                          {r.category.toLowerCase().replace(/_/g, " ")}
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[r.status]}`}>{r.status.toLowerCase()}</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      {fmtDate(r.startDate)} → {fmtDate(r.endDate)} · {r.totalDays} day{r.totalDays === 1 ? "" : "s"} ·{" "}
                      <strong>{r.currency} {Number(r.totalAmount).toFixed(2)}</strong>
                      {r.currency !== "USD" && (
                        <span className="ml-1 text-xs text-gray-500">(≈ USD {Number(r.totalAmountUSD).toFixed(2)})</span>
                      )}
                    </div>
                    {r.reason && <div className="text-sm text-gray-600 italic">“{r.reason}”</div>}
                    <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-xs text-blue-600 hover:underline">
                      {isOpen ? "Hide" : "Show"} day-by-day breakdown
                    </button>
                  </div>
                  {r.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button onClick={() => approve(r)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button onClick={() => setRejectFor(r)} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {isOpen && (
                  <table className="mt-3 min-w-full rounded-lg border border-gray-200 text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-3 py-1.5 text-left">Date</th>
                        <th className="px-3 py-1.5 text-right">Base</th>
                        <th className="px-3 py-1.5 text-center">Travel</th>
                        <th className="px-3 py-1.5 text-center">Brk</th>
                        <th className="px-3 py-1.5 text-center">Lun</th>
                        <th className="px-3 py-1.5 text-center">Din</th>
                        <th className="px-3 py-1.5 text-right">Daily ({r.currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {r.days.map((d) => (
                        <tr key={d.id} className={d.isOverride ? "bg-amber-50/50" : ""}>
                          <td className="px-3 py-1.5 tabular-nums">{fmtDate(d.date)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.currency} {Number(d.baseRate).toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-center">{d.isTravelDay ? "✓" : "—"}</td>
                          <td className="px-3 py-1.5 text-center">{d.breakfastProvided ? "✓" : "—"}</td>
                          <td className="px-3 py-1.5 text-center">{d.lunchProvided ? "✓" : "—"}</td>
                          <td className="px-3 py-1.5 text-center">{d.dinnerProvided ? "✓" : "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {r.currency} {Number(d.dailyTotal).toFixed(2)}
                            {d.isOverride && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] text-amber-800">override</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Itemized breakdown — descriptive context the employee
                    submitted. Doesn't affect the request total. */}
                {r.items && r.items.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/40 px-4 py-3 text-sm">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Itemized breakdown ({r.items.length})
                    </div>
                    <table className="min-w-full text-xs">
                      <thead className="text-[10px] uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="px-2 py-1 text-left">Category</th>
                          <th className="px-2 py-1 text-left">Description</th>
                          <th className="px-2 py-1 text-left">Date</th>
                          <th className="px-2 py-1 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {r.items.map((it) => (
                          <tr key={it.id}>
                            <td className="px-2 py-1">
                              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-700 ring-1 ring-gray-200">
                                {it.category.toLowerCase()}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-gray-800">{it.description}</td>
                            <td className="px-2 py-1 text-gray-500 tabular-nums">{it.date ? fmtDate(it.date) : "—"}</td>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-800">
                              {it.amount != null ? `${r.currency} ${Number(it.amount).toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Foreign-wire payout instructions, when the employee
                    requested a different bank / currency. Always rendered
                    (not behind the day-by-day toggle) so finance can see
                    it at a glance. */}
                {hasWirePayout(r) && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
                    <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-900">
                      <Banknote className="h-3.5 w-3.5" /> International wire transfer requested
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-900">
                      {r.payoutCurrency && (
                        <>
                          <dt className="text-blue-700">Payout currency</dt>
                          <dd className="font-medium">{r.payoutCurrency}</dd>
                        </>
                      )}
                      {r.payoutAccountHolder && (
                        <>
                          <dt className="text-blue-700">Account holder</dt>
                          <dd>{r.payoutAccountHolder}</dd>
                        </>
                      )}
                      {r.payoutAccountNumber && (
                        <>
                          <dt className="text-blue-700">Account / IBAN</dt>
                          <dd className="font-mono">{r.payoutAccountNumber}</dd>
                        </>
                      )}
                      {r.payoutBankName && (
                        <>
                          <dt className="text-blue-700">Bank</dt>
                          <dd>{r.payoutBankName}</dd>
                        </>
                      )}
                      {r.payoutSwiftCode && (
                        <>
                          <dt className="text-blue-700">SWIFT / BIC</dt>
                          <dd className="font-mono">{r.payoutSwiftCode}</dd>
                        </>
                      )}
                      {r.payoutRoutingNumber && (
                        <>
                          <dt className="text-blue-700">Routing / sort / IFSC</dt>
                          <dd className="font-mono">{r.payoutRoutingNumber}</dd>
                        </>
                      )}
                      {r.payoutBankAddress && (
                        <>
                          <dt className="text-blue-700">Bank address</dt>
                          <dd>{r.payoutBankAddress}</dd>
                        </>
                      )}
                      {r.payoutNotes && (
                        <>
                          <dt className="text-blue-700">Notes</dt>
                          <dd className="whitespace-pre-line">{r.payoutNotes}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {rejectFor && (
        <RejectModal request={rejectFor} onClose={() => setRejectFor(null)} onDone={() => { setRejectFor(null); load() }} />
      )}
    </div>
  )
}

function RejectModal({ request, onClose, onDone }: { request: PerDiemRequest; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 20) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/per-diem/request/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejectionReason: reason.trim() }),
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
          <h2 className="font-semibold text-gray-900">Reject per diem claim</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-sm text-gray-700">Reason for rejection — the employee will see this exactly.</p>
          <textarea required minLength={20} maxLength={2000} rows={5} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="At least 20 characters…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
          <div className="text-xs text-gray-500">{reason.trim().length} / 20 minimum</div>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
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
