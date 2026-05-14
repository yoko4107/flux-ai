import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Users, AlertTriangle, BarChart3, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { getConfig } from "@/lib/config"
import { Suspense } from "react"
import { DashboardFilters } from "./_components/dashboard-filters"
import { auth } from "@/lib/auth"

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) {
      added++
    }
  }
  return result
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; orgId?: string }>
}) {
  const { role: roleFilter, orgId: _orgFilter } = await searchParams
  void _orgFilter

  const session = await auth()
  // ADMIN is scoped to their own organization. Fall back to a sentinel so
  // queries return empty results when an ADMIN has no org assigned.
  const adminOrgId = session?.user?.organizationId ?? "__none__"

  const employeeSubWhere: { role?: never; organizationId?: string } = {
    organizationId: adminOrgId,
  }
  if (roleFilter) (employeeSubWhere as Record<string, unknown>).role = roleFilter

  const userWhere: Record<string, unknown> = { organizationId: adminOrgId }
  if (roleFilter) userWhere.role = roleFilter as never

  const requestOrgWhere = { employee: { organizationId: adminOrgId } as never }

  const [totalUsers, totalRequests, pendingRequests, byStatus, byCategory, pendingSteps,
         approvalDeadlineConfig, paymentDeadlineConfig, approvedRequests] =
    await Promise.all([
      prisma.user.count({ where: userWhere }),
      prisma.reimbursementRequest.count({ where: requestOrgWhere }),
      prisma.reimbursementRequest.count({ where: { ...requestOrgWhere, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
      prisma.reimbursementRequest.groupBy({ by: ["status"], _count: true, where: { employee: employeeSubWhere as never } }),
      prisma.reimbursementRequest.groupBy({ by: ["category"], _count: true, where: { employee: employeeSubWhere as never } }),
      prisma.approvalStep.findMany({
        where: {
          status: "PENDING",
          request: { employee: { organizationId: adminOrgId } },
        },
        include: {
          approver: { select: { name: true } },
          request: {
            select: {
              id: true,
              title: true,
              submittedAt: true,
              createdAt: true,
            },
          },
        },
      }),
      getConfig(prisma, "approvalDeadline"),
      getConfig(prisma, "paymentDeadline"),
      prisma.reimbursementRequest.findMany({
        where: { status: "APPROVED", employee: { organizationId: adminOrgId } as never },
        select: {
          id: true,
          title: true,
          amount: true,
          currency: true,
          updatedAt: true,
          employee: { select: { name: true, email: true, costCenter: { select: { name: true } } } },
        },
      }),
    ])

  // approvalDeadline is stored as a bare number (plan 03-01 decision)
  const deadlineBusinessDays = typeof approvalDeadlineConfig === "number" ? approvalDeadlineConfig : 3
  const paymentDeadlineDays = typeof paymentDeadlineConfig === "number" ? paymentDeadlineConfig : null

  const now = new Date()

  // Find overdue steps
  const overdueSteps = pendingSteps.filter((step) => {
    const submittedAt = step.request.submittedAt ?? step.request.createdAt
    const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
    return deadline <= now
  })

  // Find overdue payments (APPROVED requests past paymentDeadline business days from updatedAt)
  type ApprovedReq = (typeof approvedRequests)[number]
  const overduePayments: ApprovedReq[] = paymentDeadlineDays == null ? [] : approvedRequests.filter((req: ApprovedReq) => {
    const payByDate = addBusinessDays(req.updatedAt, paymentDeadlineDays)
    return payByDate <= now
  })

  // Find max count for CSS bars
  const maxStatusCount = Math.max(...byStatus.map((s) => s._count), 1)
  const maxCategoryCount = Math.max(...byCategory.map((c) => c._count), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/admin/users" className={cn(buttonVariants({ variant: "outline" }))}>
            Manage Users
          </Link>
          <Link href="/admin/config" className={cn(buttonVariants({ variant: "default" }))}>
            Configuration
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <DashboardFilters orgs={[]} />
      </Suspense>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-blue-100 w-fit">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-sm text-gray-500">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-green-100 w-fit">
              <BarChart3 className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRequests}</div>
            <p className="text-sm text-gray-500">Total Requests</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-orange-100 w-fit">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRequests}</div>
            <p className="text-sm text-gray-500">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-red-100 w-fit">
              <Clock className="h-5 w-5 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overdueSteps.length}</div>
            <p className="text-sm text-gray-500">Overdue Approvals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-amber-100 w-fit">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overduePayments.length}</div>
            <p className="text-sm text-gray-500">Overdue Payments</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Requests by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byStatus.map((item) => (
                <div key={item.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{item.status.toLowerCase().replace("_", " ")}</span>
                    <span className="font-medium">{item._count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(item._count / maxStatusCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {byStatus.length === 0 && <p className="text-gray-500 text-sm">No requests yet</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byCategory.map((item) => (
                <div key={item.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{item.category.toLowerCase()}</span>
                    <span className="font-medium">{item._count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${(item._count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {byCategory.length === 0 && <p className="text-gray-500 text-sm">No requests yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue approvals list */}
      <Card>
        <CardHeader>
          <CardTitle>Overdue Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {overdueSteps.length === 0 ? (
            <p className="text-gray-500 text-sm">No overdue approvals. All steps are on track.</p>
          ) : (
            <div className="space-y-2">
              {overdueSteps.slice(0, 10).map((step) => {
                const submittedAt = step.request.submittedAt ?? step.request.createdAt
                const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
                const daysOverdue = Math.floor((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))

                return (
                  <div
                    key={step.id}
                    className="flex items-center justify-between p-3 rounded-md border border-red-200 bg-red-50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sm">{step.request.title}</span>
                      <p className="text-xs text-gray-500">
                        Assigned to {step.approver.name ?? "Unknown"} - {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
                      </p>
                    </div>
                    <span className="text-xs font-medium text-red-600 shrink-0 ml-4">
                      Deadline: {deadline.toLocaleDateString()}
                    </span>
                  </div>
                )
              })}
              {overdueSteps.length > 10 && (
                <p className="text-sm text-gray-500 mt-2">
                  ...and {overdueSteps.length - 10} more
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overdue payments list */}
      <Card>
        <CardHeader>
          <CardTitle>Overdue Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentDeadlineDays == null ? (
            <p className="text-gray-500 text-sm">Configure a payment deadline to track overdue payments.</p>
          ) : overduePayments.length === 0 ? (
            <p className="text-gray-500 text-sm">No overdue payments. All approved requests are within the payment deadline.</p>
          ) : (
            <div className="space-y-2">
              {overduePayments.slice(0, 10).map((req) => {
                const payByDate = addBusinessDays(req.updatedAt, paymentDeadlineDays)
                const daysOverdue = Math.floor((now.getTime() - payByDate.getTime()) / (1000 * 60 * 60 * 24))

                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-3 rounded-md border border-amber-200 bg-amber-50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-sm">{req.title}</span>
                      <p className="text-xs text-gray-500">
                        {req.employee.name ?? req.employee.email ?? "Unknown"}
                        {req.employee.costCenter ? ` · ${req.employee.costCenter.name}` : ""} — {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} overdue
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <span className="text-xs font-medium text-amber-700">
                        {Number(req.amount).toLocaleString()} {req.currency}
                      </span>
                      <p className="text-xs text-gray-400">Due: {payByDate.toLocaleDateString()}</p>
                    </div>
                  </div>
                )
              })}
              {overduePayments.length > 10 && (
                <p className="text-sm text-gray-500 mt-2">
                  ...and {overduePayments.length - 10} more
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
