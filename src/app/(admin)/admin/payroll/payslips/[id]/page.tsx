"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, ArrowLeft, CheckCircle2, CircleDollarSign, RotateCcw, Trash2, Download } from "lucide-react"
import { PayslipView } from "@/components/payroll/payslip-view"

type Line = {
  id: string
  componentCode: string
  componentName: string
  type: string
  amount: string
  description: string | null
  sortOrder: number
}

type Payslip = {
  id: string
  employee: { id: string; name: string | null; email: string }
  period: string
  countryCode: string
  currency: string
  status: "DRAFT" | "FINALIZED" | "PAID"
  workingDays: number
  paidDays: number
  grossPay: string
  taxableIncome: string
  totalDeductions: string
  netPay: string
  employerCost: string
  generatedAt: string
  finalizedAt: string | null
  paidAt: string | null
  notes: string | null
  lines: Line[]
}

export default function AdminPayslipDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/payroll/payslips/${id}`).then((r) => r.json())
      setPayslip(r.payslip ?? null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: "FINALIZE" | "MARK_PAID" | "REOPEN") {
    setBusy(action)
    try {
      const res = await fetch(`/api/payroll/admin/payslips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const j = await res.json()
      if (!res.ok) { alert(j.error ?? "Action failed"); return }
      setPayslip(j.payslip)
      await load()
    } finally { setBusy(null) }
  }

  async function remove() {
    if (!confirm("Delete this draft payslip? This cannot be undone.")) return
    setBusy("DELETE")
    try {
      const res = await fetch(`/api/payroll/admin/payslips/${id}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json().catch(() => null); alert(j?.error ?? "Delete failed"); return }
      router.push("/admin/payroll/payslips")
    } finally { setBusy(null) }
  }

  if (loading) return <div className="p-10 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…</div>
  if (!payslip) return <div className="p-10 text-center text-sm text-gray-500">Payslip not found.</div>

  return (
    <div className="max-w-4xl space-y-4 p-1">
      <Link href="/admin/payroll/payslips" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to payslips
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <a
          href={`/api/payroll/payslips/${payslip.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" /> PDF
        </a>
        {payslip.status === "DRAFT" && (
          <>
            <button
              onClick={() => act("FINALIZE")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "FINALIZE" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Finalize
            </button>
            <button
              onClick={remove}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 text-rose-700 px-3 py-1.5 text-sm hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete draft
            </button>
          </>
        )}
        {payslip.status === "FINALIZED" && (
          <>
            <button
              onClick={() => act("MARK_PAID")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "MARK_PAID" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleDollarSign className="h-3.5 w-3.5" />}
              Mark paid
            </button>
            <button
              onClick={() => act("REOPEN")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Super-admin only"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reopen
            </button>
          </>
        )}
      </div>

      <PayslipView payslip={payslip} />
    </div>
  )
}
