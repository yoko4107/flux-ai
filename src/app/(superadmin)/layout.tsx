import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { SuperAdminSidebar } from "@/components/layout/superadmin-sidebar"
import { TopNav } from "@/components/layout/top-nav"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "SUPER_ADMIN") redirect(`/${session.user.role.toLowerCase().replace("_", "-")}`)
  return (
    <div className="flex min-h-screen bg-gray-50">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col">
        <TopNav />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
