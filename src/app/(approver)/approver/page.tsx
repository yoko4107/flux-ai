import { auth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { CheckSquare, CheckCircle, Clock, Timer } from "lucide-react"
import { cn } from "@/lib/utils"
import { QuickApprovalRow } from "./_components/quick-approval-row"

export default async function ApproverDashboard() {
  const session = await auth()
  const userId = session!.user.id

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [pendingSteps, approvedThisMonth, decidedStepsThisMonth, urgentPending] = await Promise.all([
    prisma.approvalStep.count({
      where: { approverId: userId, status: "PENDING" },
    }),
    prisma.approvalStep.count({
      where: {
        approverId: userId,
        status: "APPROVED",
        decidedAt: { gte: monthStart },
      },
    }),
    // Steps decided this month (for turnaround time)
    prisma.approvalStep.findMany({
      where: {
        approverId: userId,
        status: { in: ["APPROVED", "REJECTED", "CHANGE_REQUESTED"] },
        decidedAt: { gte: monthStart },
      },
      include: {
        request: { select: { submittedAt: true, createdAt: true } },
      },
    }),
    // 5 most urgent pending requests (oldest first)
    prisma.approvalStep.findMany({
      where: { approverId: userId, status: "PENDING" },
      include: {
        request: {
          select: {
            id: true,
            title: true,
            amount: true,
            currency: true,
            status: true,
            submittedAt: true,
            employee: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
  ])

  // Calculate average turnaround time in hours
  let avgTurnaroundHours: number | null = null
  if (decidedStepsThisMonth.length > 0) {
    const totalMs = decidedStepsThisMonth.reduce((sum, step) => {
      const submitted = step.request.submittedAt ?? step.request.createdAt
      const decided = step.decidedAt!
      return sum + (decided.getTime() - submitted.getTime())
    }, 0)
    avgTurnaroundHours = totalMs / decidedStepsThisMonth.length / (1000 * 60 * 60)
  }

  function formatTurnaround(hours: number | null): string {
    if (hours === null) return "N/A"
    if (hours < 1) return `${Math.round(hours * 60)}m`
    if (hours < 24) return `${Math.round(hours)}h`
    return `${(hours / 24).toFixed(1)}d`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Approver Dashboard</h1>
        <Link href="/approver/queue" className={cn(buttonVariants({ variant: "default" }))}>
          View Queue
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-orange-100 w-fit">
              <CheckSquare className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingSteps}</div>
            <p className="text-sm text-gray-500">Pending Actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-green-100 w-fit">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedThisMonth}</div>
            <p className="text-sm text-gray-500">Approved This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-blue-100 w-fit">
              <Timer className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTurnaround(avgTurnaroundHours)}</div>
            <p className="text-sm text-gray-500">Avg. Turnaround</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-purple-100 w-fit">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{decidedStepsThisMonth.length}</div>
            <p className="text-sm text-gray-500">Decided This Month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most Urgent Pending Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {urgentPending.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending requests. You are all caught up!</p>
          ) : (
            <div className="space-y-3">
              {urgentPending.map((step) => (
                <QuickApprovalRow
                  key={step.id}
                  row={{
                    requestId: step.request.id,
                    title: step.request.title,
                    status: step.request.status,
                    employeeName: step.request.employee.name,
                    submittedAt: step.request.submittedAt ? step.request.submittedAt.toISOString() : null,
                    amount: step.request.amount.toString(),
                    currency: step.request.currency,
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
