"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/brand/logo"
import { LayoutDashboard, Building2, Users, Settings, Shield } from "lucide-react"

const navItems = [
  { title: "Dashboard", href: "/superadmin", icon: <LayoutDashboard className="h-4 w-4" /> },
  { title: "Organizations", href: "/superadmin/organizations", icon: <Building2 className="h-4 w-4" /> },
  { title: "All Users", href: "/superadmin/users", icon: <Users className="h-4 w-4" /> },
  { title: "Global Config", href: "/superadmin/config", icon: <Settings className="h-4 w-4" /> },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()
  return (
    <div className="hidden md:flex flex-col w-64 min-h-screen bg-[#0B1E3F] text-white">
      <div className="p-6 border-b border-white/10">
        <Logo variant="light" size="md" />
        <div className="flex items-center gap-1.5 mt-2">
          <Shield className="h-3 w-3 text-cyan-300" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 font-medium">Super Admin</p>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors border",
              pathname === item.href || (item.href !== "/superadmin" && pathname.startsWith(item.href))
                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                : "text-slate-300 hover:bg-white/5 hover:text-white border-transparent"
            )}
          >
            {item.icon}
            {item.title}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10 text-xs text-slate-400">
        Platform-wide access
      </div>
    </div>
  )
}
