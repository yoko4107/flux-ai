"use client"

import Link from "next/link"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"

interface RequestItem {
  id: string
  title: string
  amount: string
  currency: string
  amountIDR: string | null
  status: string
  month: string | null
  createdAt: string
}

interface ChatRequestListProps {
  requests: RequestItem[]
}

function formatIDR(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function ChatRequestList({ requests }: ChatRequestListProps) {
  const display = requests.slice(0, 5)
  const totalCount = requests.length
  const totalIDR = requests.reduce(
    (sum, r) => sum + (r.amountIDR ? parseFloat(r.amountIDR) : 0),
    0
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-md">
      <div className="divide-y divide-gray-100">
        {display.map((r) => (
          <Link
            key={r.id}
            href={`/employee/requests/${r.id}`}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {r.title}
              </p>
              <p className="text-xs text-gray-500">
                {r.currency} {parseFloat(r.amount).toLocaleString()}
                {" · "}
                {new Date(r.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <StatusBadge status={r.status as RequestStatus} />
          </Link>
        ))}

        {display.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            No requests found.
          </div>
        )}
      </div>

      {/* Footer */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            {totalCount} request{totalCount !== 1 ? "s" : ""}
            {totalIDR > 0 && ` · Total ${formatIDR(totalIDR)}`}
          </span>
          <Link
            href="/employee/requests"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  )
}
