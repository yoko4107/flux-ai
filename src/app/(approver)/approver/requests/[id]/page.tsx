import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notFound } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { ApproverActionButtons } from "@/components/approver/action-buttons"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react"

const stepStatusIcon: Record<string, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4 text-gray-400" />,
  APPROVED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-500" />,
  CHANGE_REQUESTED: <AlertTriangle className="h-4 w-4 text-amber-500" />,
}

export default async function ApproverRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const userId = session!.user.id

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true, department: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
      changeRequests: {
        include: { raisedBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!request) notFound()

  const myPendingStep = request.approvalSteps.find(
    (s) => s.approverId === userId && s.status === "PENDING"
  )

  const isPdf = request.receiptUrl?.toLowerCase().endsWith(".pdf")

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/approver/queue"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{request.title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Submitted by {request.employee.name ?? request.employee.email} &mdash;{" "}
              {request.submittedAt
                ? format(new Date(request.submittedAt), "MMM d, yyyy")
                : format(new Date(request.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <StatusBadge status={request.status as any} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action buttons */}
          {myPendingStep && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your Decision</CardTitle>
              </CardHeader>
              <CardContent>
                <ApproverActionButtons
                  requestId={id}
                  hasPendingStep={!!myPendingStep}
                />
              </CardContent>
            </Card>
          )}

          {/* Request Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Amount</p>
                  <p className="font-semibold text-lg">
                    {request.currency} {Number(request.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Category</p>
                  <p className="font-medium capitalize">
                    {request.category.charAt(0) + request.category.slice(1).toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Employee</p>
                  <p className="font-medium">{request.employee.name ?? request.employee.email}</p>
                </div>
                <div>
                  <p className="text-gray-500">Department</p>
                  <p className="font-medium">{request.employee.department ?? "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Month</p>
                  <p className="font-medium">{request.month ?? "—"}</p>
                </div>
              </div>

              {request.description && (
                <div className="text-sm">
                  <p className="text-gray-500 mb-1">Description</p>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {request.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receipt Preview */}
          {request.receiptUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Receipt</CardTitle>
              </CardHeader>
              <CardContent>
                {isPdf ? (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
                    <FileText className="h-8 w-8 text-red-500" />
                    <div>
                      <p className="text-sm font-medium">PDF Receipt</p>
                      <a
                        href={request.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline"
                      >
                        View PDF
                      </a>
                    </div>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={request.receiptUrl}
                    alt="Receipt"
                    className="w-full rounded-lg border max-h-80 object-contain"
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* OCR Parsed Data */}
          {request.parsedData && Object.keys(request.parsedData as object).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">OCR Parsed Data</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap">
                  {JSON.stringify(request.parsedData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Change Request Thread */}
          {request.changeRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Request Thread</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {request.changeRequests.map((cr) => (
                  <div
                    key={cr.id}
                    className={`p-3 rounded-lg border text-sm ${
                      cr.status === "OPEN"
                        ? "bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800"
                        : "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">
                        {cr.raisedBy.name ?? "Unknown"}{" "}
                        <span className="text-gray-500 font-normal">({cr.raisedByRole})</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            cr.status === "OPEN"
                              ? "bg-amber-200 text-amber-800"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {cr.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {format(new Date(cr.createdAt), "MMM d, yyyy HH:mm")}
                        </span>
                      </div>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300">{cr.message}</p>
                    {cr.status === "RESOLVED" && cr.resolvedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Resolved {format(new Date(cr.resolvedAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Approval Timeline */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approval Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {request.approvalSteps.length === 0 ? (
                <p className="text-sm text-gray-500">No approval steps configured.</p>
              ) : (
                <div className="space-y-4">
                  {request.approvalSteps.map((step, index) => (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="mt-0.5">{stepStatusIcon[step.status]}</div>
                        {index < request.approvalSteps.length - 1 && (
                          <div className="w-px bg-gray-200 dark:bg-gray-700 flex-1 mt-2" />
                        )}
                      </div>
                      <div className="pb-4 flex-1">
                        <p className="text-sm font-medium">
                          {step.approver.name ?? step.approver.email ?? "Unknown"}
                          {step.approverId === userId && (
                            <span className="ml-1 text-xs text-blue-500">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {step.status.toLowerCase().replace(/_/g, " ")}
                        </p>
                        {step.comment && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">
                            &quot;{step.comment}&quot;
                          </p>
                        )}
                        {step.decidedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            {format(new Date(step.decidedAt), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
