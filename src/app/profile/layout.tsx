import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { SuperAdminSidebar } from "@/components/layout/superadmin-sidebar"
import { TopNav } from "@/components/layout/top-nav"

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const isSuper = session.user.role === "SUPER_ADMIN"
  return (
    <div className="flex min-h-screen bg-gray-50">
      {isSuper ? <SuperAdminSidebar /> : <Sidebar />}
      <div className="flex-1 flex flex-col">
        <TopNav />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
