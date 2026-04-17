"use client"

import { useEffect, useState } from "react"
import {
  Send,
  CheckCircle,
  XCircle,
  MessageSquare,
  DollarSign,
  Activity,
  Loader2,
} from "lucide-react"

interface TimelineEntry {
  id: string
  type: "submission" | "approval" | "rejection" | "change_request" | "payment" | "action"
  actor: { name: string; role: string }
  description: string
  details?: Record<string, unknown>
  timestamp: string
}

const typeConfig: Record<
  TimelineEntry["type"],
  { icon: typeof Send; borderColor: string; iconColor: string; bgColor: string }
> = {
  submission: {
    icon: Send,
    borderColor: "border-teal-400",
    iconColor: "text-teal-600",
    bgColor: "bg-teal-100",
  },
  approval: {
    icon: CheckCircle,
    borderColor: "border-green-400",
    iconColor: "text-green-600",
    bgColor: "bg-green-100",
  },
  rejection: {
    icon: XCircle,
    borderColor: "border-red-400",
    iconColor: "text-red-600",
    bgColor: "bg-red-100",
  },
  change_request: {
    icon: MessageSquare,
    borderColor: "border-amber-400",
    iconColor: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  payment: {
    icon: DollarSign,
    borderColor: "border-purple-400",
    iconColor: "text-purple-600",
    bgColor: "bg-purple-100",
  },
  action: {
    icon: Activity,
    borderColor: "border-gray-400",
    iconColor: "text-gray-600",
    bgColor: "bg-gray-100",
  },
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const diff = now - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatAbsoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "ADMIN":
      return "bg-red-100 text-red-700"
    case "FINANCE":
      return "bg-purple-100 text-purple-700"
    case "APPROVER":
      return "bg-blue-100 text-blue-700"
    default:
      return "bg-gray-100 text-gray-700"
  }
}

export function StatusTimeline({ requestId }: { requestId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/requests/${requestId}/status-timeline`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error || "Failed to load timeline")
          return
        }
        const data = await res.json()
        setEntries(data)
      } catch {
        setError("Failed to load timeline")
      } finally {
        setLoading(false)
      }
    }
    fetchTimeline()
  }, [requestId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading timeline...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{error}</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-8 w-8 mx-auto text-gray-400 mb-2" />
        <p className="text-gray-500">No timeline events yet.</p>
      </div>
    )
  }

  return (
    <div className="relative">
      {entries.map((entry, idx) => {
        const config = typeConfig[entry.type] ?? typeConfig.action
        const Icon = config.icon
        const isLast = idx === entries.length - 1

        return (
          <div key={entry.id} className="flex gap-4">
            {/* Left line and icon */}
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full ${config.bgColor} border-2 ${config.borderColor} shrink-0`}
              >
                <Icon className={`h-4 w-4 ${config.iconColor}`} />
              </div>
              {!isLast && (
                <div className={`w-0.5 flex-1 min-h-[24px] ${config.borderColor.replace("border-", "bg-")}`} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? "" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Actor avatar */}
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 text-xs font-semibold text-gray-700">
                  {getInitials(entry.actor.name)}
                </div>
                <span className="font-medium text-sm">{entry.actor.name}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${roleBadgeClass(entry.actor.role)}`}
                >
                  {entry.actor.role}
                </span>
              </div>
              <p className="text-sm text-gray-700 mt-1">{entry.description}</p>
              {entry.details && typeof entry.details === "object" && "comment" in entry.details && (
                <p className="text-xs text-gray-500 mt-1 italic">
                  &quot;{String(entry.details.comment)}&quot;
                </p>
              )}
              <div className="flex gap-2 mt-1 text-xs text-gray-400">
                <span>{formatRelativeTime(entry.timestamp)}</span>
                <span>-</span>
                <span>{formatAbsoluteTime(entry.timestamp)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
