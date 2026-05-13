"use client"

export type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
}

export function CostCenterSelector({
  costCenters,
  selectedCC,
  onSelect,
}: {
  costCenters: CostCenter[]
  selectedCC: CostCenter | null
  onSelect: (cc: CostCenter) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <label className="text-xs font-semibold text-gray-700 block mb-2">Select cost center</label>
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
        {costCenters.map((cc) => (
          <button
            key={cc.id}
            onClick={() => onSelect(cc)}
            className={`rounded-lg border-2 p-3 text-left transition-all ${
              selectedCC?.id === cc.id
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            } ${!cc.active ? "opacity-50" : ""}`}
          >
            <div className="font-medium text-sm text-gray-900">{cc.name}</div>
            <div className="text-xs text-gray-500 mt-1">
              {cc.code} · {cc.countryCode} · {cc.currency}
            </div>
            {!cc.active && (
              <div className="text-xs text-amber-600 mt-1 font-medium">Inactive</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
