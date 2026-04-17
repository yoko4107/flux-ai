"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"
import { cn } from "@/lib/utils"
import { CURRENCIES } from "@/lib/currencies"
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Trash2,
  Loader2,
  Upload,
  Save,
  Send,
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "OTHER"]
const TOP_CURRENCIES = CURRENCIES.slice(0, 50)

interface Approver {
  id: string
  name: string | null
  email: string | null
}

interface ApprovalStep {
  id: string
  approverId: string
  order: number
  status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGE_REQUESTED"
  comment: string | null
  decidedAt: string | null
  approver: Approver
}

interface ChangeRequest {
  id: string
  raisedById: string
  raisedByRole: string
  message: string
  status: "OPEN" | "RESOLVED"
  resolvedAt: string | null
  createdAt: string
  raisedBy: { id: string; name: string | null; role: string }
}

interface AuditLog {
  id: string
  actorId: string
  action: string
  details: Record<string, unknown> | null
  createdAt: string
  actor: { id: string; name: string | null }
}

interface RequestDetail {
  id: string
  title: string
  description: string | null
  amount: string
  currency: string
  category: string
  receiptUrl: string | null
  parsedData: Record<string, unknown> | null
  status: RequestStatus
  month: string | null
  submittedAt: string | null
  createdAt: string
  updatedAt: string
  employee: { id: string; name: string | null; email: string | null }
  approvalSteps: ApprovalStep[]
  changeRequests: ChangeRequest[]
  auditLogs: AuditLog[]
}

const stepStatusIcon = {
  PENDING: <Clock className="h-4 w-4 text-gray-400" />,
  APPROVED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  REJECTED: <XCircle className="h-4 w-4 text-red-500" />,
  CHANGE_REQUESTED: <AlertTriangle className="h-4 w-4 text-amber-500" />,
}

export default function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [request, setRequest] = useState<RequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOcr, setShowOcr] = useState(false)
  const [resubmitMessage, setResubmitMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [resubmitAmount, setResubmitAmount] = useState("")
  const [resubmitDescription, setResubmitDescription] = useState("")
  const [resubmitReceiptUrl, setResubmitReceiptUrl] = useState("")

  // Draft edit state
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editAmount, setEditAmount] = useState("")
  const [editCurrency, setEditCurrency] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [editReceiptUrl, setEditReceiptUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDraft = request?.status === "DRAFT"

  useEffect(() => {
    fetch(`/api/requests/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setRequest(data)
        // Initialize edit fields
        setEditTitle(data.title ?? "")
        setEditDescription(data.description ?? "")
        setEditAmount(String(Number(data.amount) || 0))
        setEditCurrency(data.currency ?? "USD")
        setEditCategory(data.category ?? "OTHER")
        setEditReceiptUrl(data.receiptUrl ?? "")
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // SSE for real-time status updates
  useEffect(() => {
    const es = new EventSource(`/api/requests/${id}/status-stream`)
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.status) {
          setRequest((prev) => prev ? { ...prev, status: data.status, updatedAt: data.updatedAt } : prev)
          toast.info(`Request status updated: ${data.status.replace(/_/g, " ")}`)
        }
      } catch { /* ignore parse errors */ }
    }
    return () => es.close()
  }, [id])

  const handleDelete = async () => {
    if (!confirm("Delete this draft request?")) return
    setDeleting(true)
    const res = await fetch(`/api/requests/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Request deleted")
      router.push("/employee/requests")
    } else {
      toast.error("Failed to delete request")
      setDeleting(false)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const patchBody: Record<string, unknown> = {
        title: editTitle,
        description: editDescription || null,
        amount: parseFloat(editAmount) || 0,
        currency: editCurrency,
        category: editCategory,
        receiptUrl: editReceiptUrl || null,
      }

      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })

      if (res.ok) {
        const updated = await res.json()
        setRequest((prev) => prev ? { ...prev, ...updated } : prev)
        toast.success("Draft saved")
      } else {
        const err = await res.json()
        toast.error(err.error ?? "Failed to save draft")
      }
    } catch {
      toast.error("Failed to save draft")
    }
    setSaving(false)
  }

  const handleSubmitDraft = async () => {
    if (!confirm("Submit this request? It will enter the approval workflow.")) return
    setSubmitting(true)
    try {
      const patchBody: Record<string, unknown> = {
        title: editTitle,
        description: editDescription || null,
        amount: parseFloat(editAmount) || 0,
        currency: editCurrency,
        category: editCategory,
        receiptUrl: editReceiptUrl || null,
        status: "SUBMITTED",
      }

      const res = await fetch(`/api/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      })

      if (res.ok) {
        toast.success("Request submitted!")
        // Refetch to get full data with approval steps
        const updated = await fetch(`/api/requests/${id}`).then((r) => r.json())
        setRequest(updated)
        router.refresh()
      } else {
        const err = await res.json()
        if (err.details) {
          toast.error(err.details.join("; "))
        } else {
          toast.error(err.error ?? "Failed to submit request")
        }
      }
    } catch {
      toast.error("Failed to submit request")
    }
    setSubmitting(false)
  }

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingReceipt(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload/receipt", { method: "POST", body: formData })
      if (res.ok) {
        const { url } = await res.json()
        setEditReceiptUrl(url)
        toast.success("Receipt uploaded")
      } else {
        toast.error("Failed to upload receipt")
      }
    } catch {
      toast.error("Failed to upload receipt")
    }
    setUploadingReceipt(false)
    // Reset the input
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleResubmit = async () => {
    if (!resubmitMessage.trim()) {
      toast.error("Please enter a response message")
      return
    }
    setSubmitting(true)

    // Find the open change request to resolve
    const openCr = request?.changeRequests.find((cr) => cr.status === "OPEN")

    try {
      // Step 1: Post employee's response as a change request message
      const crRes = await fetch(`/api/requests/${id}/request-change`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: resubmitMessage }),
      })
      if (!crRes.ok) {
        const err = await crRes.json()
        toast.error(err.error ?? "Failed to send response")
        setSubmitting(false)
        return
      }
      const newCr = await crRes.json()

      // Step 2: Resubmit the request (resolve the original open CR and resubmit)
      const resubmitBody: Record<string, unknown> = {
        resolveChangeRequestId: openCr?.id ?? newCr.id,
      }
      if (resubmitAmount.trim()) resubmitBody.amount = resubmitAmount
      if (resubmitDescription.trim()) resubmitBody.description = resubmitDescription
      if (resubmitReceiptUrl.trim()) resubmitBody.receiptUrl = resubmitReceiptUrl

      const resubRes = await fetch(`/api/requests/${id}/resubmit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resubmitBody),
      })
      if (resubRes.ok) {
        toast.success("Request resubmitted!")
        const updated = await fetch(`/api/requests/${id}`).then((r) => r.json())
        setRequest(updated)
        setResubmitMessage("")
        setResubmitAmount("")
        setResubmitDescription("")
        setResubmitReceiptUrl("")
        router.refresh()
      } else {
        const err = await resubRes.json()
        toast.error(err.error ?? "Failed to resubmit")
      }
    } catch {
      toast.error("Failed to resubmit request")
    }
    setSubmitting(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>
  }

  if (!request) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Request not found.</p>
        <Link
          href="/employee/requests"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to Requests
        </Link>
      </div>
    )
  }

  const isPdf = (isDraft ? editReceiptUrl : request.receiptUrl)?.toLowerCase().endsWith(".pdf")
  const displayReceiptUrl = isDraft ? editReceiptUrl : request.receiptUrl

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/employee/requests"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            {isDraft ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-2xl font-bold h-auto py-1 px-2 border-blue-300 focus:border-blue-500"
                placeholder="Request title"
              />
            ) : (
              <h1 className="text-2xl font-bold">{request.title}</h1>
            )}
            <p className="text-sm text-gray-500 mt-0.5">
              Created {format(new Date(request.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={request.status} />
          {isDraft && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Request Details */}
          <Card className={isDraft ? "border-blue-300" : undefined}>
            <CardHeader>
              <CardTitle className="text-base">
                Request Details
                {isDraft && (
                  <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Editable
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDraft ? (
                /* Editable draft form */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="edit-amount" className="text-sm text-gray-500">Amount</Label>
                      <Input
                        id="edit-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="border-blue-200 focus:border-blue-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-currency" className="text-sm text-gray-500">Currency</Label>
                      <Select value={editCurrency} onValueChange={(v) => { if (v) setEditCurrency(v) }}>
                        <SelectTrigger className="border-blue-200 focus:border-blue-400">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {TOP_CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code} - {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-category" className="text-sm text-gray-500">Category</Label>
                    <Select value={editCategory} onValueChange={(v) => { if (v) setEditCategory(v) }}>
                      <SelectTrigger className="border-blue-200 focus:border-blue-400">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0) + cat.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit-description" className="text-sm text-gray-500">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Optional description..."
                      rows={3}
                      className="border-blue-200 focus:border-blue-400"
                    />
                  </div>
                  <div className="text-sm">
                    <p className="text-gray-500 mb-1">Month</p>
                    <p className="font-medium">{request.month ?? "Will be set on save/submit"}</p>
                  </div>
                </div>
              ) : (
                /* Read-only view */
                <>
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
                      <p className="text-gray-500">Month</p>
                      <p className="font-medium">{request.month ?? "\u2014"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Submitted At</p>
                      <p className="font-medium">
                        {request.submittedAt
                          ? format(new Date(request.submittedAt), "MMM d, yyyy HH:mm")
                          : "\u2014"}
                      </p>
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
                </>
              )}
            </CardContent>
          </Card>

          {/* Receipt Preview */}
          <Card className={isDraft ? "border-blue-300" : undefined}>
            <CardHeader>
              <CardTitle className="text-base">
                Receipt
                {isDraft && (
                  <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Editable
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displayReceiptUrl ? (
                <>
                  {isPdf ? (
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border">
                      <FileText className="h-8 w-8 text-red-500" />
                      <div>
                        <p className="text-sm font-medium">PDF Receipt</p>
                        <a
                          href={displayReceiptUrl}
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
                      src={displayReceiptUrl}
                      alt="Receipt"
                      className="w-full rounded-lg border max-h-80 object-contain"
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">No receipt attached.</p>
              )}

              {isDraft && (
                <div className="mt-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleReceiptUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingReceipt}
                  >
                    {uploadingReceipt ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {displayReceiptUrl ? "Replace Receipt" : "Upload Receipt"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Draft action buttons */}
          {isDraft && (
            <div className="flex gap-3">
              <Button
                onClick={handleSaveDraft}
                disabled={saving || submitting}
                variant="outline"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
              <Button
                onClick={handleSubmitDraft}
                disabled={saving || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Request
              </Button>
            </div>
          )}

          {/* OCR Data (collapsible) */}
          {request.parsedData && Object.keys(request.parsedData).length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer flex flex-row items-center justify-between py-3"
                onClick={() => setShowOcr(!showOcr)}
              >
                <CardTitle className="text-base">OCR Parsed Data</CardTitle>
                {showOcr ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CardHeader>
              {showOcr && (
                <CardContent>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap">
                    {JSON.stringify(request.parsedData, null, 2)}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}

          {/* Change Request Thread */}
          {(request.changeRequests.length > 0 || request.status === "CHANGE_REQUESTED") && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                        <span className="text-gray-500 font-normal">
                          ({cr.raisedByRole})
                        </span>
                      </span>
                      <span className="text-xs text-gray-500">
                        {format(new Date(cr.createdAt), "MMM d, yyyy HH:mm")}
                      </span>
                    </div>
                    <p className="text-gray-700 dark:text-gray-300">{cr.message}</p>
                    {cr.status === "RESOLVED" && cr.resolvedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Resolved {format(new Date(cr.resolvedAt), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                ))}

                {/* Resubmit form */}
                {request.status === "CHANGE_REQUESTED" && (
                  <div className="space-y-3 pt-3 border-t">
                    <Label className="text-base font-semibold">Respond & Resubmit</Label>
                    <div className="space-y-2">
                      <Label htmlFor="resubmit-message">Response message (required)</Label>
                      <Textarea
                        id="resubmit-message"
                        value={resubmitMessage}
                        onChange={(e) => setResubmitMessage(e.target.value)}
                        placeholder="Describe the changes you made..."
                        rows={3}
                      />
                    </div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                      Optional: update fields
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="resubmit-amount" className="text-sm text-gray-600">
                          Updated Amount
                        </Label>
                        <input
                          id="resubmit-amount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={resubmitAmount}
                          onChange={(e) => setResubmitAmount(e.target.value)}
                          placeholder={`Current: ${Number(request.amount).toFixed(2)}`}
                          className="w-full px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="resubmit-description" className="text-sm text-gray-600">
                          Updated Description
                        </Label>
                        <Textarea
                          id="resubmit-description"
                          value={resubmitDescription}
                          onChange={(e) => setResubmitDescription(e.target.value)}
                          placeholder={request.description ?? "No description currently"}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="resubmit-receipt" className="text-sm text-gray-600">
                          Updated Receipt URL
                        </Label>
                        <input
                          id="resubmit-receipt"
                          type="url"
                          value={resubmitReceiptUrl}
                          onChange={(e) => setResubmitReceiptUrl(e.target.value)}
                          placeholder={request.receiptUrl ?? "No receipt currently"}
                          className="w-full px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <Button onClick={handleResubmit} disabled={submitting}>
                      {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Resubmit Request
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: Approval Timeline */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Approval Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {request.approvalSteps.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {request.status === "DRAFT"
                    ? "Submit your request to start the approval process."
                    : "No approval steps configured."}
                </p>
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
                        </p>
                        <p className="text-xs text-gray-500 capitalize">
                          {step.status.toLowerCase().replace("_", " ")}
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

          {/* Audit Log */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {request.auditLogs.length === 0 ? (
                <p className="text-sm text-gray-500">No activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {request.auditLogs.map((log) => (
                    <div key={log.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-xs uppercase tracking-wide text-gray-500">
                          {log.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(log.createdAt), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-xs">
                        by {log.actor.name ?? "Unknown"}
                      </p>
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
