"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/brand/logo"
import { Building2 } from "lucide-react"
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  CheckSquare,
  DollarSign,
  Settings,
  Users,
  BarChart3,
  FileCheck,
  Mail,
  Palette,
} from "lucide-react"

type NavItem = {
  title: string
  href: string
  icon: React.ReactNode
  roles: string[]
}

const navItems: NavItem[] = [
  // Employee
  {
    title: "Chat",
    href: "/employee",
    icon: <MessageSquare className="h-4 w-4" />,
    roles: ["EMPLOYEE"],
  },
  {
    title: "My Requests",
    href: "/employee/requests",
    icon: <FileText className="h-4 w-4" />,
    roles: ["EMPLOYEE"],
  },
  // Approver
  {
    title: "Dashboard",
    href: "/approver",
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ["APPROVER"],
  },
  {
    title: "Approval Queue",
    href: "/approver/queue",
    icon: <CheckSquare className="h-4 w-4" />,
    roles: ["APPROVER"],
  },
  // Finance
  {
    title: "Dashboard",
    href: "/finance",
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ["FINANCE"],
  },
  {
    title: "Reports",
    href: "/finance/reports",
    icon: <BarChart3 className="h-4 w-4" />,
    roles: ["FINANCE"],
  },
  // Admin
  {
    title: "Dashboard",
    href: "/admin",
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ["ADMIN"],
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: <Users className="h-4 w-4" />,
    roles: ["ADMIN"],
  },
  {
    title: "Invitations",
    href: "/admin/invitations",
    icon: <Mail className="h-4 w-4" />,
    roles: ["ADMIN"],
  },
  {
    title: "Branding",
    href: "/admin/branding",
    icon: <Palette className="h-4 w-4" />,
    roles: ["ADMIN"],
  },
  {
    title: "Configuration",
    href: "/admin/config",
    icon: <Settings className="h-4 w-4" />,
    roles: ["ADMIN"],
  },
]

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const role = session?.user?.role
  const [org, setOrg] = useState<{ name: string; logoUrl: string | null } | null>(null)

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    fetch("/api/my-organization")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.organization) return
        setOrg({ name: data.organization.name, logoUrl: data.organization.logoUrl ?? null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [session?.user?.id])

  const filteredItems = navItems.filter(
    (item) => role && item.roles.includes(role)
  )

  return (
    <>
      <div className="p-6 border-b border-white/10">
        <Logo variant="light" size="md" />
        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 mt-2">
          {role?.replace("_", " ").toLowerCase()} portal
        </p>
      </div>
      {org && (
        <div className="px-6 py-4 border-b border-white/10" title={org.name}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 mb-2">Workspace</p>
          {org.logoUrl ? (
            <div className="bg-white/10 rounded-md px-3 py-2 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={org.logoUrl}
                alt={org.name}
                className="h-9 max-h-9 w-auto max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-white/10 flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="text-sm font-medium text-white truncate">{org.name}</p>
            </div>
          )}
        </div>
      )}
      <nav className="flex-1 p-4 space-y-1">
        {filteredItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === item.href
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                : "text-slate-300 hover:bg-white/5 hover:text-white border border-transparent"
            )}
          >
            {item.icon}
            {item.title}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="text-xs text-slate-400">
          {session?.user?.name}
          <br />
          <span className="text-slate-500">{session?.user?.email}</span>
        </div>
      </div>
    </>
  )
}

export function Sidebar() {
  return (
    <div className="hidden md:flex flex-col w-64 min-h-screen bg-[#0B1E3F] text-white">
      <SidebarContent />
    </div>
  )
}
