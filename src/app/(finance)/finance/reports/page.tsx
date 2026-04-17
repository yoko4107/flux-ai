"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Download, ExternalLink, FileText, Loader2, Eye, Save, Pencil, Sheet,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { format } from "date-fns"
import { formatCurrencyFull } from "@/lib/currencies"

interface ReportRow {
  requestId: string
  employeeName: string
  department: string
  category: string
  amount: number
  amountBase: number | null
  currency: string
  exchangeRate: number | null
  receiptUrl: string | null
  submittedAt: string | null
  approvedAt: string | null
  paidAt: string | null
  status: string
  title: string
}

interface ReportData {
  data: ReportRow[]
  totalsByCategory: Record<string, number>
  totalsByCategoryBase: Record<string, number>
  grandTotal: number
  grandTotalBase: number
  month: string
  baseCurrency: string
}

interface SummaryNote {
  category: string
  note: string
}

export default function FinanceReportsPage() {
  const now = new Date()
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  )
  const [report, setReport] = useState<ReportData | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null)

  // Editable summary state
  const [summaryNotes, setSummaryNotes] = useState<SummaryNote[]>([])
  const [generalNotes, setGeneralNotes] = useState("")
  const [editingSummary, setEditingSummary] = useState(false)

  const loadReport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/monthly?month=${month}`)
      if (!res.ok) {
        toast.error((await res.json()).error || "Failed to load report")
        return
      }
      const data: ReportData = await res.json()
      setReport(data)

      // Initialize summary notes per category
      const cats = Object.keys(data.totalsByCategory)
      setSummaryNotes(cats.map((c) => ({ category: c, note: "" })))
      setGeneralNotes("")
      setLastSheetUrl(null)
    } catch {
      toast.error("Failed to load report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/reports/export-sheet?month=${month}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryNotes: summaryNotes.filter((n) => n.note),
          generalNotes: generalNotes || undefined,
        }),
      })
      if (!res.ok) {
        toast.error((await res.json()).error || "Export failed")
        return
      }
      const data = await res.json()
      if (data.sheetUrl) {
        setLastSheetUrl(data.sheetUrl)
        toast.success("Exported to Google Sheets!")
        window.open(data.sheetUrl, "_blank")
      } else if (data.csvData) {
        const blob = new Blob([data.csvData], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        // Use RI_Name_Month_Year format
        const [y, m] = month.split("-")
        const mNames = ["January","February","March","April","May","June","July","August","September","October","November","December"]
        const mName = mNames[parseInt(m, 10) - 1]
        a.download = `RI_Finance_${mName}_${y}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("CSV downloaded (Google Sheets not configured)")
      }
    } catch {
      toast.error("Export failed")
    } finally {
      setExporting(false)
    }
  }

  const filteredData = report?.data.filter(
    (row) => statusFilter === "ALL" || row.status === statusFilter
  )

  const baseCurrency = report?.baseCurrency ?? "IDR"
  const formatBase = (v: number) => formatCurrencyFull(v, baseCurrency)

  // Compute summaries — totals are expressed in the org base currency so
  // cross-currency requests add correctly.
  const summaryData = useMemo(() => {
    if (!filteredData) return null
    const byCategory: Record<string, { count: number; totalBase: number }> = {}
    const byDepartment: Record<string, { count: number; totalBase: number }> = {}
    const byEmployee: Record<string, { count: number; totalBase: number; dept: string }> = {}
    const byStatus: Record<string, { count: number; totalBase: number }> = {}
    let grandTotalBase = 0

    for (const r of filteredData) {
      const base = r.amountBase ?? 0
      grandTotalBase += base
      if (!byCategory[r.category]) byCategory[r.category] = { count: 0, totalBase: 0 }
      byCategory[r.category].count++; byCategory[r.category].totalBase += base

      if (!byDepartment[r.department]) byDepartment[r.department] = { count: 0, totalBase: 0 }
      byDepartment[r.department].count++; byDepartment[r.department].totalBase += base

      if (!byEmployee[r.employeeName]) byEmployee[r.employeeName] = { count: 0, totalBase: 0, dept: r.department }
      byEmployee[r.employeeName].count++; byEmployee[r.employeeName].totalBase += base

      if (!byStatus[r.status]) byStatus[r.status] = { count: 0, totalBase: 0 }
      byStatus[r.status].count++; byStatus[r.status].totalBase += base
    }

    return { byCategory, byDepartment, byEmployee, byStatus, grandTotalBase }
  }, [filteredData])

  // Derive month label
  const monthLabel = useMemo(() => {
    if (!month) return ""
    const [y, m] = month.split("-").map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  }, [month])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Monthly Reports</h1>
        <div className="flex gap-2">
          {lastSheetUrl && (
            <a href={lastSheetUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Sheet className="h-4 w-4 mr-1" /> Open Google Sheet
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </a>
          )}
          <Button onClick={handleExport} disabled={exporting || !report?.data.length} variant="outline">
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export to Google Sheets
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div>
              <label className="text-sm font-medium mb-1 block">Month</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "ALL")}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={loadReport} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Load Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions table */}
      {report && filteredData && filteredData.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transactions — {monthLabel}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">FX Rate</TableHead>
                    <TableHead className="text-right">Converted ({baseCurrency})</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((row) => (
                    <TableRow key={row.requestId}>
                      <TableCell className="font-medium">{row.employeeName}</TableCell>
                      <TableCell>{row.department}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{row.title}</TableCell>
                      <TableCell className="capitalize">{row.category.toLowerCase()}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrencyFull(row.amount, row.currency)}</TableCell>
                      <TableCell className="text-right font-mono text-gray-500">
                        {row.currency === baseCurrency
                          ? "—"
                          : row.exchangeRate != null
                            ? `1 ${row.currency} = ${row.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${baseCurrency}`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-gray-700">{row.amountBase != null ? formatBase(row.amountBase) : "—"}</TableCell>
                      <TableCell><StatusBadge status={row.status as RequestStatus} /></TableCell>
                      <TableCell className="text-sm text-gray-500">{row.submittedAt ? format(new Date(row.submittedAt), "MMM d") : "—"}</TableCell>
                      <TableCell className="text-sm text-gray-500">{row.approvedAt ? format(new Date(row.approvedAt), "MMM d") : "—"}</TableCell>
                      <TableCell>
                        <Link href={`/finance/requests/${row.requestId}`}>
                          <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ═══ EDITABLE SUMMARY SECTION ═══ */}
          {summaryData && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    Summary — {monthLabel}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSummary(!editingSummary)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    {editingSummary ? "Done Editing" : "Edit Notes"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">

                {/* By Category */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    By Category <span className="text-gray-400 font-normal">(totals in {baseCurrency})</span>
                  </h3>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Category</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500"># Requests</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">Total ({baseCurrency})</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">% of Total</th>
                          {editingSummary && <th className="px-4 py-2 text-left font-medium text-gray-500">Notes</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(summaryData.byCategory)
                          .sort((a, b) => b[1].totalBase - a[1].totalBase)
                          .map(([cat, v]) => (
                            <tr key={cat}>
                              <td className="px-4 py-2 font-medium capitalize">{cat.toLowerCase()}</td>
                              <td className="px-4 py-2 text-right">{v.count}</td>
                              <td className="px-4 py-2 text-right font-mono">{formatBase(v.totalBase)}</td>
                              <td className="px-4 py-2 text-right">
                                {summaryData.grandTotalBase > 0 ? Math.round((v.totalBase / summaryData.grandTotalBase) * 100) : 0}%
                              </td>
                              {editingSummary && (
                                <td className="px-4 py-2">
                                  <Input
                                    value={summaryNotes.find((n) => n.category === cat)?.note || ""}
                                    onChange={(e) => {
                                      setSummaryNotes((prev) =>
                                        prev.map((n) => n.category === cat ? { ...n, note: e.target.value } : n)
                                      )
                                    }}
                                    placeholder="Add note..."
                                    className="h-7 text-xs"
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        <tr className="bg-gray-50 font-bold">
                          <td className="px-4 py-2">Total</td>
                          <td className="px-4 py-2 text-right">{filteredData.length}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatBase(summaryData.grandTotalBase)}</td>
                          <td className="px-4 py-2 text-right">100%</td>
                          {editingSummary && <td />}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Show saved notes inline when not editing */}
                  {!editingSummary && summaryNotes.some((n) => n.note) && (
                    <div className="mt-2 space-y-1">
                      {summaryNotes.filter((n) => n.note).map((n) => (
                        <p key={n.category} className="text-xs text-gray-500">
                          <span className="font-medium capitalize">{n.category.toLowerCase()}:</span> {n.note}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* By Department */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    By Department <span className="text-gray-400 font-normal">(totals in {baseCurrency})</span>
                  </h3>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Department</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500"># Requests</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">Total ({baseCurrency})</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">% of Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(summaryData.byDepartment)
                          .sort((a, b) => b[1].totalBase - a[1].totalBase)
                          .map(([dept, v]) => (
                            <tr key={dept}>
                              <td className="px-4 py-2 font-medium">{dept}</td>
                              <td className="px-4 py-2 text-right">{v.count}</td>
                              <td className="px-4 py-2 text-right font-mono">{formatBase(v.totalBase)}</td>
                              <td className="px-4 py-2 text-right">{summaryData.grandTotalBase > 0 ? Math.round((v.totalBase / summaryData.grandTotalBase) * 100) : 0}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* By Employee */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    By Employee <span className="text-gray-400 font-normal">(ranked by {baseCurrency} amount)</span>
                  </h3>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Employee</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">Department</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500"># Requests</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">Total ({baseCurrency})</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">Avg/Request</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {Object.entries(summaryData.byEmployee)
                          .sort((a, b) => b[1].totalBase - a[1].totalBase)
                          .map(([emp, v]) => (
                            <tr key={emp}>
                              <td className="px-4 py-2 font-medium">{emp}</td>
                              <td className="px-4 py-2 text-gray-600">{v.dept}</td>
                              <td className="px-4 py-2 text-right">{v.count}</td>
                              <td className="px-4 py-2 text-right font-mono">{formatBase(v.totalBase)}</td>
                              <td className="px-4 py-2 text-right font-mono">{v.count > 0 ? formatBase(v.totalBase / v.count) : formatBase(0)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* By Status */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">By Status</h3>
                  <div className="flex gap-4 flex-wrap">
                    {Object.entries(summaryData.byStatus).map(([st, v]) => (
                      <div key={st} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-gray-50">
                        <StatusBadge status={st as RequestStatus} />
                        <span className="text-sm font-medium">{v.count}</span>
                        <span className="text-xs text-gray-500">({formatBase(v.totalBase)})</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General notes */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">General Notes</h3>
                  {editingSummary ? (
                    <Textarea
                      value={generalNotes}
                      onChange={(e) => setGeneralNotes(e.target.value)}
                      placeholder="Add general notes for this month's report (will be included in the Google Sheet export)..."
                      rows={3}
                    />
                  ) : generalNotes ? (
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border">{generalNotes}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No notes. Click &quot;Edit Notes&quot; to add.</p>
                  )}
                </div>

                <Separator />

                {/* Export bar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="text-sm text-gray-500">
                    This summary will be included in the Google Sheet export as the &quot;Summary&quot; tab.
                  </div>
                  <div className="flex gap-2">
                    {lastSheetUrl && (
                      <a href={lastSheetUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Sheet className="h-4 w-4 mr-1" /> Open Sheet <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </a>
                    )}
                    <Button onClick={handleExport} disabled={exporting || !report?.data.length}>
                      {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                      Export to Google Sheets
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : report && filteredData?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No approved requests for this month</h3>
            <p className="text-sm text-gray-500">Try selecting a different month or status filter.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
