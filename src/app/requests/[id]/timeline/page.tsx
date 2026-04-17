import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { StatusTimeline } from "@/components/timeline/status-timeline"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true } },
      approvalSteps: { select: { approverId: true } },
    },
  })

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Request not found.</p>
      </div>
    )
  }

  // Check access: owner, approver with steps, finance, admin
  const userId = session.user.id
  const userRole = session.user.role

  if (userRole === "EMPLOYEE" && request.employeeId !== userId) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">You do not have access to this request.</p>
      </div>
    )
  }

  if (userRole === "APPROVER") {
    const hasStep = request.approvalSteps.some((s) => s.approverId === userId)
    if (!hasStep) {
      return (
        <div className="text-center py-12">
          <p className="text-red-500">You do not have access to this request.</p>
        </div>
      )
    }
  }

  // Build a back link based on role
  const backHref =
    userRole === "EMPLOYEE"
      ? `/employee/requests/${id}`
      : userRole === "APPROVER"
        ? `/approver/requests/${id}`
        : userRole === "FINANCE"
          ? `/finance/requests/${id}`
          : `/admin`

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Request Timeline</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{request.title}</span>
            <StatusBadge status={request.status as RequestStatus} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusTimeline requestId={id} />
        </CardContent>
      </Card>
    </div>
  )
}
