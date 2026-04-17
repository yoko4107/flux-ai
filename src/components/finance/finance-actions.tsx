"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { DollarSign, Download, FileCheck, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface FinanceActionsProps {
  requestId: string
  status: string
}

export function FinanceActions({ requestId, status }: FinanceActionsProps) {
  const router = useRouter()
  const [markPaidOpen, setMarkPaidOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleMarkPaid = async () => {
    setLoading(true)
    try {
      const formData = new FormData()
      if (file) formData.append("proofFile", file)
      if (notes) formData.append("notes", notes)

      const res = await fetch(`/api/requests/${requestId}/mark-paid`, {
        method: "PATCH",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Failed to mark as paid")
        return
      }

      toast.success("Request marked as paid!")
      setMarkPaidOpen(false)
      setNotes("")
      setFile(null)
      router.refresh()
    } catch {
      toast.error("Failed to mark as paid")
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadBundle = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/requests/${requestId}/proof-bundle`)
      if (!res.ok) {
        toast.error("Failed to download proof bundle")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `proof-bundle-${requestId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Proof bundle downloaded!")
    } catch {
      toast.error("Failed to download")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex gap-3">
      {status === "APPROVED" && (
        <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
          <DialogTrigger>
            <DollarSign className="h-4 w-4 mr-2" />
            Mark as Paid
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark Request as Paid</DialogTitle>
              <DialogDescription>
                Upload proof of transfer and add any notes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Transfer Proof (optional)</Label>
                <div className="mt-1">
                  <Input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file && (
                    <p className="text-xs text-gray-500 mt-1">
                      {file.name} ({(file.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment reference, bank confirmation number, etc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setMarkPaidOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleMarkPaid} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Button
        variant="outline"
        onClick={handleDownloadBundle}
        disabled={downloading}
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Download Proof Bundle
      </Button>
    </div>
  )
}
