"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, Search, ArrowRight } from "lucide-react"

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

type User = {
  id: string
  name: string | null
  email: string
  role: string
  department: string | null
  costCenterId: string | null
}

export function EmployeesSection({ costCenter }: { costCenter: CostCenter }) {
  const [employees, setEmployees] = useState<User[]>([])
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users?costCenterId=${costCenter.id}`)
        const data = await res.json()
        setEmployees(Array.isArray(data) ? data : data.users ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [costCenter.id])

  const filtered = employees.filter((u) =>
    (u.name ?? "").toLowerCase().includes(filter.toLowerCase()) ||
    u.email.toLowerCase().includes(filter.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        <p>No employees assigned to this cost center yet.</p>
        <Link href="/admin/cost-centers" className="mt-2 inline-block text-blue-700 hover:underline">
          Manage cost center assignments
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or email"
            className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No employees match.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((emp) => (
              <li key={emp.id} className="p-4 hover:bg-gray-50">
                <Link href={`/admin/payroll/employees`} className="block">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{emp.name ?? "—"}</p>
                      <p className="text-xs text-gray-500">
                        {emp.email} · {emp.role}
                        {emp.department ? ` · ${emp.department}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center mt-4">
        To edit compensation and generate payslips, click on an employee or go to the Employees page in Payroll settings.
      </p>
    </div>
  )
}
