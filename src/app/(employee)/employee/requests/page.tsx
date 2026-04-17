"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { formatCurrencyFull } from "@/lib/currencies"
import {
  Plus,
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  CalendarDays,
  Save,
  Trash2,
  Loader2,
  X,
  Download,
  Share2,
  Upload,
  ExternalLink,
} from "lucide-react"
import { format, isBefore } from "date-fns"
import { Suspense } from "react"
import { toast } from "sonner"

interface Request {
  id: string
  title: string
  category: string
  amount: string
  currency: string
  amountIDR: string | null
  exchangeRate: string | null
  status: RequestStatus
  month: string | null
  submittedAt: string | null
  createdAt: string
}

interface MonthFolder {
  month: string // YYYY-MM
  label: string // "April 2026"
  deadline: Date
  isOpen: boolean // past deadline
  isCurrent: boolean
  requests: Request[]
  totalAmount: number
  totalIDR: number
  statusCounts: Record<string, number>
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CHANGE_REQUESTED", label: "Changes Requested" },
  { value: "PAID", label: "Paid" },
]

function RequestsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [submissionDeadlineDay, setSubmissionDeadlineDay] = useState(20)
  const [activeSubmissionMonth, setActiveSubmissionMonth] = useState("")

  const status = searchParams.get("status") ?? ""

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.set("status", status)
    const [reqRes, configRes] = await Promise.all([
      fetch(`/api/requests?${params.toString()}`),
      fetch("/api/config/public"),
    ])
    if (reqRes.ok) {
      setRequests(await reqRes.json())
    }
    if (configRes.ok) {
      const configs = await configRes.json()
      if (configs.submissionDeadline?.day) {
        setSubmissionDeadlineDay(configs.submissionDeadline.day)
      }
      if (configs.currentSubmissionMonth) {
        setActiveSubmissionMonth(configs.currentSubmissionMonth)
      }
    }
    setLoading(false)
  }, [status])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-expand active submission month
  useEffect(() => {
    if (activeSubmissionMonth) {
      setExpandedMonths((prev) => new Set([...prev, activeSubmissionMonth]))
    }
  }, [activeSubmissionMonth])

  // Group requests into monthly folders
  const folders = useMemo(() => {
    const now = new Date()
    const currentMonth = activeSubmissionMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const grouped = new Map<string, Request[]>()

    // Group requests by month
    for (const req of requests) {
      const month = req.month || currentMonth
      if (!grouped.has(month)) grouped.set(month, [])
      grouped.get(month)!.push(req)
    }

    // Ensure current month always shows
    if (!grouped.has(currentMonth)) grouped.set(currentMonth, [])

    // Build folder objects
    const folderList: MonthFolder[] = []
    for (const [month, reqs] of grouped) {
      const [year, mon] = month.split("-").map(Number)
      const deadlineDate = new Date(year, mon - 1, submissionDeadlineDay, 23, 59, 59)
      const isPastDeadline = isBefore(deadlineDate, now)
      const isCurrent = month === currentMonth

      const statusCounts: Record<string, number> = {}
      let total = 0
      let totalIDR = 0
      for (const r of reqs) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
        total += Number(r.amount)
        totalIDR += r.amountIDR ? Number(r.amountIDR) : 0
      }

      const d = new Date(year, mon - 1, 1)
      folderList.push({
        month,
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        deadline: deadlineDate,
        isOpen: !isPastDeadline,
        isCurrent,
        requests: reqs.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        totalAmount: total,
        totalIDR,
        statusCounts,
      })
    }

    // Sort: current month first, then newest to oldest
    folderList.sort((a, b) => {
      if (a.isCurrent) return -1
      if (b.isCurrent) return 1
      return b.month.localeCompare(a.month)
    })

    return folderList
  }, [requests, submissionDeadlineDay, activeSubmissionMonth])

  const toggleFolder = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/employee/requests?${params.toString()}`)
  }

  const daysUntilDeadline = (deadline: Date) => {
    const now = new Date()
    const diff = deadline.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Requests</h1>
        <Link href="/employee/new" className={cn(buttonVariants({ variant: "default" }))}>
          <Plus className="h-4 w-4 mr-2" />
          New Request
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-3 items-center flex-wrap">
        <select
          value={status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          Submission deadline: {submissionDeadlineDay}th of each month
        </span>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">No requests found</h3>
            <p className="text-sm text-gray-500 mb-6">
              You haven&apos;t submitted any reimbursement requests yet.
            </p>
            <Link href="/employee/new" className={cn(buttonVariants({ variant: "default" }))}>
              <Plus className="h-4 w-4 mr-2" />
              Submit your first request
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {folders.map((folder) => {
            const isExpanded = expandedMonths.has(folder.month)
            const days = daysUntilDeadline(folder.deadline)
            const hasDrafts = (folder.statusCounts["DRAFT"] || 0) > 0

            return (
              <div key={folder.month} className="rounded-lg border bg-white overflow-hidden">
                {/* Folder header */}
                <button
                  onClick={() => toggleFolder(folder.month)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 text-gray-400 transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                  {isExpanded ? (
                    <FolderOpen className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Folder className="h-5 w-5 text-blue-400" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{folder.label}</span>
                      {folder.isCurrent && (
                        <Badge variant="default" className="text-xs px-1.5 py-0">
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {folder.requests.length} request{folder.requests.length !== 1 ? "s" : ""}
                      </span>
                      {folder.totalAmount > 0 && (
                        <span className="text-xs text-gray-500">
                          Total: {folder.totalIDR > 0
                            ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(folder.totalIDR)
                            : formatCurrencyFull(folder.totalAmount, folder.requests[0]?.currency || "USD")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Deadline status */}
                  <div className="flex items-center gap-2 shrink-0">
                    {folder.isOpen ? (
                      days <= 3 && days > 0 ? (
                        <div className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-xs font-medium">
                            {days} day{days !== 1 ? "s" : ""} left
                          </span>
                        </div>
                      ) : days <= 0 ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CalendarDays className="h-4 w-4" />
                          <span className="text-xs font-medium">Due today</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs">
                            Due {format(folder.deadline, "MMM d")}
                          </span>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1 text-gray-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">Closed</span>
                      </div>
                    )}

                    {/* Status summary pills */}
                    <div className="hidden sm:flex items-center gap-1">
                      {folder.statusCounts["DRAFT"] ? (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-gray-500 border-gray-300">
                          {folder.statusCounts["DRAFT"]} draft
                        </Badge>
                      ) : null}
                      {(folder.statusCounts["SUBMITTED"] || 0) +
                        (folder.statusCounts["UNDER_REVIEW"] || 0) >
                        0 && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-blue-600 border-blue-300">
                          {(folder.statusCounts["SUBMITTED"] || 0) +
                            (folder.statusCounts["UNDER_REVIEW"] || 0)}{" "}
                          pending
                        </Badge>
                      )}
                      {folder.statusCounts["APPROVED"] ? (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-green-600 border-green-300">
                          {folder.statusCounts["APPROVED"]} approved
                        </Badge>
                      ) : null}
                      {folder.statusCounts["PAID"] ? (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-purple-600 border-purple-300">
                          {folder.statusCounts["PAID"]} paid
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </button>

                {/* Deadline warning banner */}
                {isExpanded && folder.isOpen && folder.isCurrent && hasDrafts && days <= 5 && days > 0 && (
                  <div className="mx-4 mb-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 flex items-center gap-2 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>
                      You have {folder.statusCounts["DRAFT"]} draft{(folder.statusCounts["DRAFT"] || 0) > 1 ? "s" : ""} — submit before{" "}
                      <strong>{format(folder.deadline, "MMMM d")}</strong> ({days} day{days !== 1 ? "s" : ""} remaining)
                    </span>
                  </div>
                )}

                {/* Expanded: request table */}
                {isExpanded && (
                  <div className="border-t">
                    {folder.requests.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-500 mb-3">No requests for this month</p>
                        {folder.isOpen && (
                          <Link
                            href="/employee/new"
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Request
                          </Link>
                        )}
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                              Title
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                              Category
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 text-xs uppercase tracking-wider">
                              Amount
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                              Status
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">
                              Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {folder.requests.map((req) => (
                            <tr
                              key={req.id}
                              className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                              onClick={() => router.push(`/employee/requests/${req.id}`)}
                            >
                              <td className="px-4 py-2.5 font-medium text-gray-900">
                                {req.title}
                              </td>
                              <td className="px-4 py-2.5 text-gray-600 capitalize">
                                {req.category.toLowerCase()}
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-gray-900">
                                <div>{formatCurrencyFull(Number(req.amount), req.currency)}</div>
                                {req.amountIDR && req.currency !== "IDR" && (
                                  <div className="text-[11px] text-gray-400 font-normal">
                                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(req.amountIDR))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <StatusBadge status={req.status} />
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">
                                {req.submittedAt
                                  ? format(new Date(req.submittedAt), "MMM d")
                                  : format(new Date(req.createdAt), "MMM d")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {/* Folder total row */}
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td className="px-4 py-2 font-medium text-gray-700 text-xs" colSpan={2}>
                              {folder.requests.length} request{folder.requests.length !== 1 ? "s" : ""}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-gray-900 text-xs">
                              <div>
                                {folder.totalIDR > 0
                                  ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(folder.totalIDR)
                                  : formatCurrencyFull(folder.totalAmount, folder.requests[0]?.currency || "USD")}
                              </div>
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    )}

                    {/* Add request button inside folder */}
                    {folder.isOpen && folder.requests.length > 0 && (
                      <div className="px-4 py-2 border-t bg-gray-50/50">
                        <Link
                          href="/employee/new"
                          className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add another request for {folder.label}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Editable Spreadsheet Table */}
      {!loading && requests.length > 0 && (
        <SpreadsheetTable requests={requests} onRefresh={fetchData} />
      )}
    </div>
  )
}

// ─── Editable Spreadsheet Table ───
interface EditingRow {
  title: string
  amount: string
  currency: string
  category: string
}

// ── Export/Share helpers ──
function buildCSV(requests: Request[]): string {
  const fmtIDR = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)
  const headers = ["Title", "Date", "Amount", "Currency", "IDR Amount", "Category", "Status", "Month"]
  const rows = requests.map((r) => [
    `"${r.title.replace(/"/g, '""')}"`,
    r.submittedAt ? format(new Date(r.submittedAt), "yyyy-MM-dd") : format(new Date(r.createdAt), "yyyy-MM-dd"),
    Number(r.amount).toFixed(2),
    r.currency,
    r.amountIDR ? fmtIDR(Number(r.amountIDR)) : "-",
    r.category,
    r.status,
    r.month || "-",
  ])
  const totalIDR = requests.reduce((s, r) => s + (r.amountIDR ? Number(r.amountIDR) : 0), 0)
  rows.push(["TOTAL", "", "", "", fmtIDR(totalIDR), "", `${requests.length} requests`, ""])
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
}

function downloadCSV(requests: Request[]) {
  const csv = buildCSV(requests)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  const monthLabel = requests[0]?.month || format(new Date(), "yyyy-MM")
  a.href = url
  a.download = `RI_Reimbursements_${monthLabel}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success("CSV downloaded!")
}

async function shareNative(requests: Request[]) {
  const totalIDR = requests.reduce((s, r) => s + (r.amountIDR ? Number(r.amountIDR) : 0), 0)
  const fmtIDR = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

  const statusCounts: Record<string, number> = {}
  requests.forEach((r) => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1 })

  const summary = [
    `Reimbursement Summary`,
    `Total: ${fmtIDR(totalIDR)} (${requests.length} requests)`,
    ``,
    ...Object.entries(statusCounts).map(([s, c]) => `${s}: ${c}`),
    ``,
    `Requests:`,
    ...requests.slice(0, 10).map((r) => `- ${r.title}: ${r.currency} ${Number(r.amount).toLocaleString()} (${r.status})`),
    requests.length > 10 ? `... and ${requests.length - 10} more` : "",
  ].filter(Boolean).join("\n")

  if (navigator.share) {
    try {
      // Try sharing with CSV file
      const csv = buildCSV(requests)
      const blob = new Blob([csv], { type: "text/csv" })
      const file = new File([blob], `reimbursements.csv`, { type: "text/csv" })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Reimbursement Summary", text: summary, files: [file] })
      } else {
        await navigator.share({ title: "Reimbursement Summary", text: summary })
      }
      toast.success("Shared!")
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(summary)
        toast.success("Copied to clipboard!")
      }
    }
  } else {
    // Desktop fallback: copy to clipboard
    await navigator.clipboard.writeText(summary)
    toast.success("Summary copied to clipboard!")
  }
}

async function uploadToGDrive(requests: Request[], setUploadingDrive: (v: boolean) => void) {
  setUploadingDrive(true)
  try {
    const monthLabel = requests[0]?.month || format(new Date(), "yyyy-MM")
    const res = await fetch(`/api/reports/export-sheet?month=${monthLabel}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.sheetUrl) {
        toast.success("Uploaded to Google Drive!")
        window.open(data.sheetUrl, "_blank")
      } else if (data.csvData) {
        // Not configured — download CSV instead
        const blob = new Blob([data.csvData], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `RI_${monthLabel}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.info("Google Drive not configured. CSV downloaded instead.")
      }
    } else {
      const err = await res.json()
      toast.error(err.error || "Upload failed")
    }
  } catch {
    toast.error("Failed to upload to Google Drive")
  }
  setUploadingDrive(false)
}

function SpreadsheetTable({
  requests,
  onRefresh,
}: {
  requests: Request[]
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState<Record<string, EditingRow>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [uploadingDrive, setUploadingDrive] = useState(false)

  const startEditing = (req: Request) => {
    setEditing((prev) => ({
      ...prev,
      [req.id]: {
        title: req.title,
        amount: req.amount,
        currency: req.currency,
        category: req.category,
      },
    }))
  }

  const cancelEditing = (id: string) => {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updateField = (id: string, field: keyof EditingRow, value: string) => {
    setEditing((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const saveRow = async (id: string) => {
    const row = editing[id]
    if (!row) return
    setSaving((prev) => new Set([...prev, id]))
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: row.title,
          amount: parseFloat(row.amount),
          currency: row.currency,
          category: row.category,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to save")
        return
      }
      toast.success("Saved")
      cancelEditing(id)
      onRefresh()
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const deleteRow = async (id: string) => {
    setDeleting((prev) => new Set([...prev, id]))
    try {
      const res = await fetch(`/api/requests/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to delete")
        return
      }
      toast.success("Deleted")
      onRefresh()
    } catch {
      toast.error("Failed to delete")
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const totalIDR = requests.reduce(
    (sum, r) => sum + (r.amountIDR ? Number(r.amountIDR) : 0),
    0
  )

  const statusCounts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">All Requests</CardTitle>
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
              {Object.entries(statusCounts).map(([s, count]) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100">
                  {s.replace("_", " ").toLowerCase()}: {count}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => downloadCSV(requests)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Download CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
            <button
              onClick={() => shareNative(requests)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Share summary"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
            <button
              onClick={() => uploadToGDrive(requests, setUploadingDrive)}
              disabled={uploadingDrive}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              title="Upload to Google Drive"
            >
              {uploadingDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Drive</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Title
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Date
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">
                  Amount
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Currency
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-right font-medium text-gray-600 whitespace-nowrap">
                  IDR Amount
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Category
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Status
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                  Month
                </th>
                <th className="border border-gray-200 px-2 sm:px-3 py-2 text-center font-medium text-gray-600 whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req, idx) => {
                const isDraft = req.status === "DRAFT"
                const isEditing = !!editing[req.id]
                const isSaving = saving.has(req.id)
                const isDeleting = deleting.has(req.id)
                const row = editing[req.id]

                return (
                  <tr
                    key={req.id}
                    className={cn(
                      idx % 2 === 0 ? "bg-white" : "bg-gray-50/50",
                      !isDraft && "text-gray-500",
                      isDraft && "text-gray-900"
                    )}
                  >
                    {/* Title */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) =>
                            updateField(req.id, "title", e.target.value)
                          }
                          className="w-full min-w-[120px] rounded border border-gray-300 px-1.5 py-1 text-xs sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span
                          className={cn(
                            "block truncate max-w-[200px]",
                            isDraft && "cursor-pointer hover:text-blue-600"
                          )}
                          onClick={() => isDraft && startEditing(req)}
                        >
                          {req.title}
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5 whitespace-nowrap">
                      {req.submittedAt
                        ? format(new Date(req.submittedAt), "MMM d, yyyy")
                        : format(new Date(req.createdAt), "MMM d, yyyy")}
                    </td>

                    {/* Amount */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5 text-right font-mono">
                      {isEditing ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) =>
                            updateField(req.id, "amount", e.target.value)
                          }
                          className="w-full min-w-[80px] rounded border border-gray-300 px-1.5 py-1 text-right text-xs sm:text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span
                          className={cn(isDraft && "cursor-pointer hover:text-blue-600")}
                          onClick={() => isDraft && startEditing(req)}
                        >
                          {formatCurrencyFull(Number(req.amount), req.currency)}
                        </span>
                      )}
                    </td>

                    {/* Currency */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5">
                      {isEditing ? (
                        <select
                          value={row.currency}
                          onChange={(e) =>
                            updateField(req.id, "currency", e.target.value)
                          }
                          className="w-full min-w-[70px] rounded border border-gray-300 px-1 py-1 text-xs sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="USD">USD</option>
                          <option value="IDR">IDR</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                          <option value="SGD">SGD</option>
                          <option value="MYR">MYR</option>
                          <option value="JPY">JPY</option>
                          <option value="AUD">AUD</option>
                        </select>
                      ) : (
                        <span
                          className={cn(isDraft && "cursor-pointer hover:text-blue-600")}
                          onClick={() => isDraft && startEditing(req)}
                        >
                          {req.currency}
                        </span>
                      )}
                    </td>

                    {/* IDR Amount */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5 text-right font-mono whitespace-nowrap">
                      {req.amountIDR
                        ? new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            maximumFractionDigits: 0,
                          }).format(Number(req.amountIDR))
                        : "-"}
                    </td>

                    {/* Category */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5">
                      {isEditing ? (
                        <select
                          value={row.category}
                          onChange={(e) =>
                            updateField(req.id, "category", e.target.value)
                          }
                          className="w-full min-w-[80px] rounded border border-gray-300 px-1 py-1 text-xs sm:text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="TRAVEL">Travel</option>
                          <option value="MEALS">Meals</option>
                          <option value="SUPPLIES">Supplies</option>
                          <option value="OTHER">Other</option>
                        </select>
                      ) : (
                        <span
                          className={cn(
                            "capitalize",
                            isDraft && "cursor-pointer hover:text-blue-600"
                          )}
                          onClick={() => isDraft && startEditing(req)}
                        >
                          {req.category.toLowerCase()}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5">
                      <StatusBadge status={req.status} />
                    </td>

                    {/* Month */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5 whitespace-nowrap">
                      {req.month || "-"}
                    </td>

                    {/* Actions */}
                    <td className="border border-gray-200 px-2 sm:px-3 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveRow(req.id)}
                              disabled={isSaving}
                              className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                              title="Save"
                            >
                              {isSaving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => cancelEditing(req.id)}
                              disabled={isSaving}
                              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : isDraft ? (
                          <>
                            <button
                              onClick={() => startEditing(req)}
                              className="rounded p-1 text-blue-600 hover:bg-blue-50"
                              title="Edit"
                            >
                              <Save className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteRow(req.id)}
                              disabled={isDeleting}
                              className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                              title="Delete"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Total row */}
            <tfoot className="bg-gray-100 font-medium">
              <tr>
                <td
                  className="border border-gray-200 px-2 sm:px-3 py-2 text-gray-700"
                  colSpan={4}
                >
                  Total ({requests.length} requests)
                </td>
                <td className="border border-gray-200 px-2 sm:px-3 py-2 text-right font-mono text-gray-900">
                  {totalIDR > 0
                    ? new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        maximumFractionDigits: 0,
                      }).format(totalIDR)
                    : "-"}
                </td>
                <td className="border border-gray-200" colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function RequestsPage() {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <Suspense fallback={<div className="text-center py-12 text-gray-500">Loading...</div>}>
        <RequestsContent />
      </Suspense>
    </div>
  )
}
