import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusBadge } from "@/components/status-badge"
import { FinanceActions } from "@/components/finance/finance-actions"
import { format } from "date-fns"
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
} from "lucide-react"

export default async function FinanceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "FINANCE" && session.user.role !== "ADMIN") {
    redirect("/finance")
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: {
        select: { name: true, email: true, department: true },
      },
      approvalSteps: {
        include: {
          approver: { select: { name: true, email: true } },
        },
        orderBy: { order: "asc" },
      },
      changeRequests: {
        include: {
          raisedBy: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  })

  if (!request) redirect("/finance/reports")

  // Check for transfer proof in audit logs
  const paidLog = request.auditLogs.find((l) => l.action === "REQUEST_PAID")
  const proofUrl = (paidLog?.details as any)?.proofUrl
  const paymentNotes = (paidLog?.details as any)?.notes

  const stepStatusIcon = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "REJECTED":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "CHANGE_REQUESTED":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{request.title}</h1>
          <p className="text-sm text-gray-500">
            Submitted by {request.employee.name || request.employee.email} (
            {request.employee.department})
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      <FinanceActions requestId={request.id} status={request.status} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Request Details */}
        <Card>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="font-mono font-medium">
                {request.currency} {Number(request.amount).toFixed(2)}
              </span>
              <span className="text-gray-500">Category</span>
              <span className="capitalize">
                {request.category.toLowerCase()}
              </span>
              <span className="text-gray-500">Month</span>
              <span>{request.month || "—"}</span>
              <span className="text-gray-500">Submitted</span>
              <span>
                {request.submittedAt
                  ? format(new Date(request.submittedAt), "MMM d, yyyy HH:mm")
                  : "—"}
              </span>
              <span className="text-gray-500">Status</span>
              <span>
                <StatusBadge status={request.status} />
              </span>
            </div>
            {request.description && (
              <>
                <Separator />
                <div>
                  <span className="text-sm text-gray-500">Description</span>
                  <p className="text-sm mt-1">{request.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Receipt */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt</CardTitle>
          </CardHeader>
          <CardContent>
            {request.receiptUrl ? (
              <div>
                {request.receiptUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <img
                    src={request.receiptUrl}
                    alt="Receipt"
                    className="max-h-64 rounded border object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 p-4 bg-gray-50 rounded border">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium">PDF Receipt</p>
                      <a
                        href={request.receiptUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <ImageIcon className="h-12 w-12 mx-auto mb-2" />
                <p className="text-sm">No receipt attached</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Proof (if paid) */}
      {request.status === "PAID" && paidLog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-purple-700">Payment Proof</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <span className="text-gray-500">Paid at: </span>
              <span>
                {format(new Date(paidLog.createdAt), "MMM d, yyyy HH:mm")}
              </span>
            </div>
            {paymentNotes && (
              <div className="text-sm">
                <span className="text-gray-500">Notes: </span>
                <span>{paymentNotes}</span>
              </div>
            )}
            {proofUrl && (
              <div>
                {proofUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                  <img
                    src={proofUrl}
                    alt="Transfer proof"
                    className="max-h-48 rounded border object-contain"
                  />
                ) : (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View transfer proof document
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approval Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Approval Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {request.approvalSteps.length === 0 ? (
            <p className="text-sm text-gray-500">No approval steps yet.</p>
          ) : (
            <div className="space-y-4">
              {request.approvalSteps.map((step) => (
                <div
                  key={step.id}
                  className="flex items-start gap-3 relative"
                >
                  <div className="mt-0.5">{stepStatusIcon(step.status)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {step.approver.name || step.approver.email}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        Step {step.order}
                      </Badge>
                      <Badge
                        variant={
                          step.status === "APPROVED"
                            ? "default"
                            : step.status === "REJECTED"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {step.status}
                      </Badge>
                    </div>
                    {step.comment && (
                      <p className="text-sm text-gray-600 mt-1">
                        {step.comment}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {step.decidedAt
                        ? format(new Date(step.decidedAt), "MMM d, yyyy HH:mm")
                        : "Pending"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Requests */}
      {request.changeRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Change Request Thread</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {request.changeRequests.map((cr) => (
                <div
                  key={cr.id}
                  className={`p-3 rounded-lg border text-sm ${
                    cr.raisedByRole === "APPROVER"
                      ? "bg-amber-50 border-amber-200"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {cr.raisedBy.name || cr.raisedBy.email}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {cr.raisedByRole}
                    </Badge>
                    {cr.status === "RESOLVED" && (
                      <Badge
                        variant="default"
                        className="text-xs bg-green-600"
                      >
                        Resolved
                      </Badge>
                    )}
                  </div>
                  <p>{cr.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(cr.createdAt), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
