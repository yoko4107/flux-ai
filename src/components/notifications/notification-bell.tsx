"use client"

import { Bell } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"

interface Notification {
  id: string
  message: string
  read: boolean
  sentAt: string
  requestId?: string
  type: string
}

function getRequestHref(role: string | undefined, id: string): string {
  switch (role) {
    case "APPROVER":
      return `/approver/requests/${id}`
    case "FINANCE":
      return `/finance/requests/${id}`
    case "EMPLOYEE":
      return `/employee/requests/${id}`
    case "ADMIN":
    case "SUPER_ADMIN":
      return `/requests/${id}/timeline`
    default:
      return `/requests/${id}/timeline`
  }
}

export function NotificationBell() {
  const { data: session } = useSession()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  const fetchNotifications = async () => {
    if (!session) return
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
      }
    } catch {}
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const markAllRead = async () => {
    await fetch("/api/notifications/mark-read", { method: "POST" })
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">
              No notifications
            </p>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border-b last:border-0 ${
                  !notification.read ? "bg-blue-50" : ""
                }`}
              >
                {notification.requestId ? (
                  <Link
                    href={getRequestHref(session?.user?.role, notification.requestId)}
                    onClick={() => setOpen(false)}
                    className="block"
                  >
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(notification.sentAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </Link>
                ) : (
                  <div>
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(notification.sentAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
