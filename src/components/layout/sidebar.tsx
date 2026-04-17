"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/brand/logo"
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
