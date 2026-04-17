"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react"

interface ActionButtonsProps {
  requestId: string
  hasPendingStep: boolean
}

export function ApproverActionButtons({ requestId, hasPendingStep }: ActionButtonsProps) {
  const router = useRouter()
  const [approving, setApproving] = useState(false)

  // Reject dialog state
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectComment, setRejectComment] = useState("")
  const [rejecting, setRejecting] = useState(false)

  // Change request dialog state
  const [showChangeDialog, setShowChangeDialog] = useState(false)
  const [changeMessage, setChangeMessage] = useState("")
  const [requestingChange, setRequestingChange] = useState(false)

  if (!hasPendingStep) return null

  const handleApprove = async () => {
    setApproving(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        toast.success("Request approved successfully")
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? "Failed to approve request")
      }
    } catch {
      toast.error("Failed to approve request")
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async () => {
    if (!rejectComment.trim()) {
      toast.error("Please provide a reason for rejection")
      return
    }
    setRejecting(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: rejectComment }),
      })
      if (res.ok) {
        toast.success("Request rejected")
        setShowRejectDialog(false)
        setRejectComment("")
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? "Failed to reject request")
      }
    } catch {
      toast.error("Failed to reject request")
    } finally {
      setRejecting(false)
    }
  }

  const handleRequestChange = async () => {
    if (!changeMessage.trim()) {
      toast.error("Please provide a message describing the required changes")
      return
    }
    setRequestingChange(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/request-change`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: changeMessage }),
      })
      if (res.ok) {
        toast.success("Change request sent to employee")
        setShowChangeDialog(false)
        setChangeMessage("")
        router.refresh()
      } else {
        const err = await res.json()
        toast.error(err.error ?? "Failed to send change request")
      }
    } catch {
      toast.error("Failed to send change request")
    } finally {
      setRequestingChange(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleApprove} disabled={approving} className="bg-green-600 hover:bg-green-700 text-white">
          {approving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Approve
        </Button>

        <Button
          onClick={() => setShowRejectDialog(true)}
          variant="destructive"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Reject
        </Button>

        <Button
          onClick={() => setShowChangeDialog(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Request Change
        </Button>
      </div>

      {/* Reject dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Reject Request</h2>
            <div className="space-y-2">
              <Label htmlFor="reject-comment">Reason for rejection (required)</Label>
              <Textarea
                id="reject-comment"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Please explain why this request is being rejected..."
                rows={4}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowRejectDialog(false)
                  setRejectComment("")
                }}
                disabled={rejecting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
                {rejecting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change request dialog */}
      {showChangeDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Request Changes</h2>
            <div className="space-y-2">
              <Label htmlFor="change-message">Describe the required changes</Label>
              <Textarea
                id="change-message"
                value={changeMessage}
                onChange={(e) => setChangeMessage(e.target.value)}
                placeholder="Please describe what changes are needed..."
                rows={4}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowChangeDialog(false)
                  setChangeMessage("")
                }}
                disabled={requestingChange}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRequestChange}
                disabled={requestingChange}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {requestingChange && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Send Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
