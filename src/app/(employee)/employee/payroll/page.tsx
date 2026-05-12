"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, FileText, Download } from "lucide-react"

// Employee payroll — list of released payslips with YTD totals.

type Payslip = {
  id: string
  period: string
  currency: string
  status: "FINALIZED" | "PAID"
  grossPay: string
  totalDeductions: string
  netPay: string
  paidAt: string | null
}

type YTD = { year: string; grossPay: number; totalDeductions: number; netPay: number; currency: string }

export default function EmployeePayrollPage() {
  const [items, setItems] = useState<Payslip[]>([])
  const [ytd, setYtd] = useState<YTD[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/payroll/payslips")
      .then((r) => r.json())
      .then((d) => {
        const payslips: Payslip[] = d.payslips ?? []
        setItems(payslips)
        // Build per-year YTD from the list (API returns a single combined sum;
        // showing per-year is more useful when histories span calendar years).
        const byYear = new Map<string, YTD>()
        for (const p of payslips) {
          const year = p.period.slice(0, 4)
          const entry = byYear.get(year) ?? { year, grossPay: 0, totalDeductions: 0, netPay: 0, currency: p.currency }
          entry.grossPay += Number(p.grossPay)
          entry.totalDeductions += Number(p.totalDeductions)
          entry.netPay += Number(p.netPay)
          byYear.set(year, entry)
        }
        setYtd([...byYear.values()].sort((a, b) => b.year.localeCompare(a.year)))
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…</div>
  }

  return (
    <div className="max-w-5xl space-y-5 p-1">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Payroll</h1>
        <p className="text-sm text-gray-500 mt-1">Monthly payslips released by your organization.</p>
      </div>

      {ytd.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ytd.map((y) => (
            <div key={y.year} className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Year-to-date {y.year}</p>
              <p className="mt-1 text-lg font-bold text-gray-900 tabular-nums">{fmt(y.netPay, y.currency)}</p>
              <p className="text-[11px] text-gray-500 tabular-nums">
                Gross {fmt(y.grossPay, y.currency)} · Deductions {fmt(y.totalDeductions, y.currency)}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Payslips</h2>
        </div>
        {items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">No payslips released yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 font-mono">{p.period}</p>
                  <p className="text-xs text-gray-500">
                    {p.status === "PAID" && p.paidAt ? `Paid ${new Date(p.paidAt).toLocaleDateString()}` : p.status}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Net pay</p>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">{fmt(p.netPay, p.currency)}</p>
                  </div>
                  <a
                    href={`/api/payroll/payslips/${p.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs hover:bg-gray-50"
                    title="Download PDF"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </a>
                  <Link
                    href={`/employee/payroll/${p.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-2.5 py-1.5 text-xs font-medium text-white"
                  >
                    <FileText className="h-3.5 w-3.5" /> View
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function fmt(v: string | number, c: string) {
  const n = typeof v === "string" ? Number(v) : v
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n)
  } catch { return `${c} ${n.toFixed(2)}` }
}
