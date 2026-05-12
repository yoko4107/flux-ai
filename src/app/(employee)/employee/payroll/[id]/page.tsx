"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft, Download } from "lucide-react"
import { PayslipView } from "@/components/payroll/payslip-view"

export default function EmployeePayslipDetailPage() {
  const params = useParams<{ id: string }>()
  const [payslip, setPayslip] = useState<Parameters<typeof PayslipView>[0]["payslip"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/payroll/payslips/${params.id}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          setError(j?.error ?? `HTTP ${r.status}`)
          return null
        }
        return r.json()
      })
      .then((d) => { if (d?.payslip) setPayslip(d.payslip) })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…</div>
  if (error) return <div className="p-10 text-center text-sm text-rose-700">{error}</div>
  if (!payslip) return null

  return (
    <div className="max-w-4xl space-y-4 p-1">
      <div className="flex items-center justify-between">
        <Link href="/employee/payroll" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to payroll
        </Link>
        <a
          href={`/api/payroll/payslips/${payslip.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white"
        >
          <Download className="h-3.5 w-3.5" /> Download PDF
        </a>
      </div>
      <PayslipView payslip={payslip} />
    </div>
  )
}
