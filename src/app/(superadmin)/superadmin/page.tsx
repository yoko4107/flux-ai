import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { Building2, Users, FileText, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function SuperAdminDashboard() {
  const [totalOrgs, totalUsers, totalRequests, pendingRequests, orgsWithCounts] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.reimbursementRequest.count(),
    prisma.reimbursementRequest.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    prisma.organization.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ])

  const usersByRole = await prisma.user.groupBy({ by: ["role"], _count: true })
  const requestsByStatus = await prisma.reimbursementRequest.groupBy({ by: ["status"], _count: true })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Overview</h1>
          <p className="text-sm text-gray-500 mt-1">All organizations and system-wide metrics</p>
        </div>
        <div className="flex gap-2">
          <Link href="/superadmin/organizations" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Manage Orgs
          </Link>
          <Link href="/superadmin/users" className={cn(buttonVariants({ size: "sm" }))}>
            All Users
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><div className="inline-flex p-2 rounded-lg bg-purple-100 w-fit"><Building2 className="h-5 w-5 text-purple-600" /></div></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalOrgs}</div><p className="text-sm text-gray-500">Organizations</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><div className="inline-flex p-2 rounded-lg bg-blue-100 w-fit"><Users className="h-5 w-5 text-blue-600" /></div></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalUsers}</div><p className="text-sm text-gray-500">Total Users</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><div className="inline-flex p-2 rounded-lg bg-green-100 w-fit"><FileText className="h-5 w-5 text-green-600" /></div></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalRequests}</div><p className="text-sm text-gray-500">Total Requests</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><div className="inline-flex p-2 rounded-lg bg-orange-100 w-fit"><AlertTriangle className="h-5 w-5 text-orange-600" /></div></CardHeader>
          <CardContent><div className="text-2xl font-bold">{pendingRequests}</div><p className="text-sm text-gray-500">Pending Review</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Organizations list */}
        <Card>
          <CardHeader><CardTitle className="text-base">Organizations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {orgsWithCounts.map((org) => (
                <div key={org.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{org.name}</p>
                    <p className="text-xs text-gray-500">{org.industry ?? "No industry"} · {org.slug}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">{org._count.users} users</span>
                </div>
              ))}
              {orgsWithCounts.length === 0 && <p className="text-sm text-gray-500">No organizations yet.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Users by role */}
        <Card>
          <CardHeader><CardTitle className="text-base">Users by Role</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {usersByRole.map((item) => (
                <div key={item.role}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{item.role.toLowerCase().replace("_", " ")}</span>
                    <span className="font-medium">{item._count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(item._count / Math.max(totalUsers, 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Requests by status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Requests by Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requestsByStatus.map((item) => (
                <div key={item.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{item.status.toLowerCase().replace("_", " ")}</span>
                    <span className="font-medium">{item._count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(item._count / Math.max(totalRequests, 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
              {requestsByStatus.length === 0 && <p className="text-sm text-gray-500">No requests yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
