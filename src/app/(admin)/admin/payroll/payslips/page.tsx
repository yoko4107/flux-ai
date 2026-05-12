"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, FileText, ArrowLeft } from "lucide-react"

type Payslip = {
  id: string
  period: string
  countryCode: string
  currency: string
  status: "DRAFT" | "FINALIZED" | "PAID"
  grossPay: string
  totalDeductions: string
  netPay: string
  generatedAt: string
  employee: { id: string; name: string | null; email: string }
}

export default function AdminPayslipsPage() {
  const [items, setItems] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<string>("")
  const [status, setStatus] = useState<string>("")

  async function load() {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (period) qs.set("period", period)
      if (status) qs.set("status", status)
      const r = await fetch(`/api/payroll/admin/payslips?${qs}`).then((r) => r.json())
      setItems(r.payslips ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [period, status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-6xl space-y-4 p-1">
      <Link href="/admin/payroll" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to payroll
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
        <p className="text-sm text-gray-500 mt-1">All generated payslips across the organization.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
          <label className="text-xs text-gray-500">
            Period
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs" />
          </label>
          <label className="text-xs text-gray-500">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs">
              <option value="">All</option>
              <option value="DRAFT">Draft</option>
              <option value="FINALIZED">Finalized</option>
              <option value="PAID">Paid</option>
            </select>
          </label>
          {(period || status) && (
            <button onClick={() => { setPeriod(""); setStatus("") }} className="text-xs text-blue-700 hover:underline">Clear</button>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">
            No payslips. Head to <Link href="/admin/payroll/employees" className="text-blue-700 hover:underline">Employees</Link> to generate one.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <th className="px-5 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 font-medium">Period</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium text-right">Gross</th>
                <th className="px-2 py-2 font-medium text-right">Deductions</th>
                <th className="px-2 py-2 font-medium text-right">Net</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-900">{p.employee.name ?? "—"}</p>
                    <p className="text-xs text-gray-500">{p.employee.email}</p>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs">{p.period}</td>
                  <td className="px-2 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{fmt(p.grossPay, p.currency)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-rose-700">{fmt(p.totalDeductions, p.currency)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{fmt(p.netPay, p.currency)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Link href={`/admin/payroll/payslips/${p.id}`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                      <FileText className="h-3.5 w-3.5" /> Open
                    </Link>
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

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700 ring-gray-200",
    FINALIZED: "bg-blue-50 text-blue-700 ring-blue-200",
    PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${palette[status] ?? ""}`}>{status}</span>
}

function fmt(v: string | number, c: string) {
  const n = typeof v === "string" ? Number(v) : v
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n)
  } catch { return `${c} ${n.toFixed(2)}` }
}
