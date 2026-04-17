import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { TopNav } from "@/components/layout/top-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") {
    if (session.user.role === "SUPER_ADMIN") redirect("/superadmin")
    else redirect(`/${session.user.role.toLowerCase()}`)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
