"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

interface Org { id: string; name: string }

export function DashboardFilters({ orgs }: { orgs: Org[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleFilter = searchParams.get("role") ?? ""
  const orgFilter = searchParams.get("orgId") ?? ""

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`/admin?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {(["", "EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const).map((r) => (
          <button
            key={r}
            onClick={() => updateFilter("role", r)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              roleFilter === r
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r === "" ? "All Roles" : r}
          </button>
        ))}
      </div>
      {orgs.length > 0 && (
        <select
          value={orgFilter}
          onChange={(e) => updateFilter("orgId", e.target.value)}
          className="h-7 rounded-md border border-gray-200 bg-white px-2 py-0 text-xs text-gray-600 focus:outline-none"
        >
          <option value="">All Organizations</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      )}
      {(roleFilter || orgFilter) && (
        <button
          onClick={() => { updateFilter("role", ""); updateFilter("orgId", "") }}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
