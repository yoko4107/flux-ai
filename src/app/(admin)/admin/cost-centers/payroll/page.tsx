"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Loader2, ArrowLeft } from "lucide-react"
import { CostCenterSelector } from "./components/cost-center-selector"
import { OverviewSection } from "./components/overview-section"
import { EmployeesSection } from "./components/employees-section"
import { RulesSection } from "./components/rules-section"

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

export default function CostCenterPayrollPage() {
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "employees" | "rules" | "payslips">("overview")

  useEffect(() => {
    async function loadCostCenters() {
      setLoading(true)
      try {
        const res = await fetch("/api/admin/cost-centers")
        const data = await res.json()
        const centers = (Array.isArray(data) ? data : data.costCenters) || []
        setCostCenters(centers)
        if (centers.length > 0 && !selectedCC) {
          setSelectedCC(centers[0])
        }
      } finally {
        setLoading(false)
      }
    }
    loadCostCenters()
  }, [])

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "employees", label: "Employees" },
    { id: "rules", label: "Rules" },
    { id: "payslips", label: "Payslips" },
  ] as const

  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-gray-500">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    )
  }

  if (costCenters.length === 0) {
    return (
      <div className="max-w-5xl space-y-4 p-1">
        <Link href="/admin/cost-centers" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to cost centers
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          <p>No cost centers configured yet.</p>
          <Link href="/admin/cost-centers" className="mt-2 inline-block text-blue-700 hover:underline">
            Create a cost center
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-5 p-1">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Center Payroll</h1>
          <p className="text-sm text-gray-500 mt-1">Manage employees, rules, and payslips per cost center.</p>
        </div>
        <Link href="/admin/cost-centers" className="text-sm text-blue-700 hover:underline">
          ← Back to cost centers
        </Link>
      </div>

      <CostCenterSelector
        costCenters={costCenters}
        selectedCC={selectedCC}
        onSelect={setSelectedCC}
      />

      {selectedCC && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5">
            <div className="flex gap-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-700 text-blue-700"
                      : "border-transparent text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {activeTab === "overview" && <OverviewSection costCenter={selectedCC} />}
            {activeTab === "employees" && <EmployeesSection costCenter={selectedCC} />}
            {activeTab === "rules" && <RulesSection costCenter={selectedCC} />}
            {activeTab === "payslips" && (
              <div className="text-center text-sm text-gray-500 py-8">
                Payslips view coming soon
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
