"use client"

import { useEffect, useState } from "react"
import { Building2, LogOut, Menu, User as UserIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useSession } from "next-auth/react"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { SidebarContent } from "@/components/layout/sidebar"

export function TopNav() {
  const { data: session } = useSession()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
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

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <div className="h-16 border-b bg-white flex items-center justify-between px-6 gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
        <div className="flex-1 flex items-center gap-3 min-w-0">
          {org && (
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                {org.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={org.logoUrl} alt={org.name} className="h-full w-full object-contain" />
                ) : (
                  <Building2 className="h-4 w-4 text-slate-400" />
                )}
              </div>
              <span className="text-sm font-medium text-[#0B1E3F] truncate">{org.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "relative h-9 w-9 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials || "U"}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-gray-500">
                <div className="font-medium text-gray-900 truncate">{session?.user?.name}</div>
                <div className="truncate">{session?.user?.email}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <UserIcon className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-[#0B1E3F] text-white border-white/10">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}
