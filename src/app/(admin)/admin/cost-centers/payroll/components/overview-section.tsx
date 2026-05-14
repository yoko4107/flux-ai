"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

export function OverviewSection({ costCenter }: { costCenter: CostCenter }) {
  const [employeeCount, setEmployeeCount] = useState<number | null>(null)
  const [ruleCount, setRuleCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [empRes, rulesRes] = await Promise.all([
          fetch(`/api/admin/users?costCenterId=${costCenter.id}`),
          fetch(`/api/payroll/admin/rules?costCenterId=${costCenter.id}`),
        ])
        const empData = await empRes.json()
        const rulesData = await rulesRes.json()

        setEmployeeCount(Array.isArray(empData) ? empData.length : 0)
        setRuleCount(rulesData.rules?.length ?? 0)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [costCenter.id])

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Code</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{costCenter.code}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Name</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{costCenter.name}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Country</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{costCenter.countryCode}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">Currency</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{costCenter.currency}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
          <p className="text-xs uppercase tracking-wider text-blue-700 font-medium">Employees</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{employeeCount ?? "—"}</p>
        </div>
        <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
          <p className="text-xs uppercase tracking-wider text-purple-700 font-medium">Payroll Rules</p>
          <p className="mt-1 text-2xl font-bold text-purple-900">{ruleCount ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-xs uppercase tracking-wider text-gray-600 font-medium mb-2">Status</p>
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${
          costCenter.active
            ? "bg-emerald-100 text-emerald-800"
            : "bg-gray-200 text-gray-800"
        }`}>
          {costCenter.active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  )
}
