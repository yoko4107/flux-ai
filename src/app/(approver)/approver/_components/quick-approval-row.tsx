"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, X, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"
import { toast } from "sonner"

type Row = {
  requestId: string
  title: string
  status: string
  employeeName: string | null
  submittedAt: string | null
  amount: string
  currency: string
}

export function QuickApprovalRow({ row }: { row: Row }) {
  const router = useRouter()
  const [approving, setApproving] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [comment, setComment] = useState("")
  const [submittingReject, setSubmittingReject] = useState(false)

  async function approve() {
    setApproving(true)
    const res = await fetch(`/api/requests/${row.requestId}/approve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    setApproving(false)
    if (res.ok) {
      toast.success(`Approved "${row.title}"`)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error || "Failed to approve")
    }
  }

  async function reject() {
    if (!comment.trim()) {
      toast.error("Please provide a reason for rejection")
      return
    }
    setSubmittingReject(true)
    const res = await fetch(`/api/requests/${row.requestId}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() }),
    })
    setSubmittingReject(false)
    if (res.ok) {
      toast.success(`Rejected "${row.title}"`)
      setRejectOpen(false)
      setComment("")
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error || "Failed to reject")
    }
  }

  const busy = approving || submittingReject

  return (
    <>
      <div className="flex items-center justify-between p-3 rounded-md border hover:bg-gray-50 transition-colors gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{row.title}</span>
            <StatusBadge status={row.status as RequestStatus} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            by {row.employeeName ?? "Unknown"}
            {row.submittedAt && <> · submitted {new Date(row.submittedAt).toLocaleDateString()}</>}
          </p>
        </div>
        <div className="text-sm font-medium text-gray-700 shrink-0">
          {row.currency} {Number(row.amount).toFixed(2)}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
            disabled={busy}
            onClick={approve}
          >
            <Check className="h-4 w-4 mr-1" />
            {approving ? "…" : "Approve"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <X className="h-4 w-4 mr-1" />
            Reject
          </Button>
          <Link
            href={`/approver/requests/${row.requestId}`}
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 px-2"
            title="View details"
          >
            Details
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(o) => !busy && setRejectOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              Let the employee know why you&apos;re rejecting &ldquo;{row.title}&rdquo;. This comment will appear in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comment">Reason *</Label>
            <Textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Receipt is illegible; please resubmit with a clearer copy."
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={submittingReject}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={submittingReject || !comment.trim()}>
              {submittingReject ? "Rejecting…" : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
