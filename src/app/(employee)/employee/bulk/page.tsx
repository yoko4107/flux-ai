"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Image as ImageIcon,
  ArrowRight,
  Edit,
} from "lucide-react"
import { toast } from "sonner"
import { CURRENCIES, CURRENCY_MAP } from "@/lib/currencies"
import { formatCurrencyFull } from "@/lib/currencies"
import Link from "next/link"
import { cn, } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface QueuedFile {
  file: File
  preview?: string
  isPdf: boolean
}

interface BulkResult {
  index: number
  filename: string
  url?: string
  title?: string
  amount?: number
  currency?: string
  category?: string
  status: "success" | "error" | "pending"
  error?: string
  requestId?: string
}

export default function BulkUploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<QueuedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const [action, setAction] = useState<"draft" | "submit">("draft")
  const [defaultCurrency, setDefaultCurrency] = useState("USD")
  const [defaultCategory, setDefaultCategory] = useState("OTHER")

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
    const toAdd: QueuedFile[] = []

    for (const file of Array.from(newFiles)) {
      if (!validTypes.includes(file.type)) continue
      if (file.size > 10 * 1024 * 1024) continue

      const isPdf = file.type === "application/pdf"
      let preview: string | undefined
      if (!isPdf) {
        preview = URL.createObjectURL(file)
      }
      toAdd.push({ file, preview, isPdf })
    }

    setFiles((prev) => {
      const combined = [...prev, ...toAdd]
      if (combined.length > 20) {
        toast.error("Maximum 20 files per upload")
        return combined.slice(0, 20)
      }
      return combined
    })
  }, [])

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = [...prev]
      if (next[index].preview) URL.revokeObjectURL(next[index].preview!)
      next.splice(index, 1)
      return next
    })
  }

  const clearAll = () => {
    for (const f of files) {
      if (f.preview) URL.revokeObjectURL(f.preview)
    }
    setFiles([])
    setResults(null)
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setProgress(0)
    setResults(null)

    const formData = new FormData()
    for (const f of files) {
      formData.append("files", f.file)
    }
    formData.append("action", action)
    formData.append("currency", defaultCurrency)
    formData.append("category", defaultCategory)

    try {
      const res = await fetch("/api/requests/bulk", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Bulk upload failed")
        setUploading(false)
        return
      }

      const data = await res.json()
      setResults(data.results)
      setProgress(100)

      if (data.errors === 0) {
        toast.success(
          `All ${data.success} receipt${data.success !== 1 ? "s" : ""} uploaded as ${action === "draft" ? "drafts" : "submitted"}!`
        )
      } else {
        toast.warning(
          `${data.success} succeeded, ${data.errors} failed`
        )
      }
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const successCount = results?.filter((r) => r.status === "success").length ?? 0
  const errorCount = results?.filter((r) => r.status === "error").length ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bulk Upload Receipts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload multiple receipts at once — OCR will auto-parse each one
          </p>
        </div>
        <Link
          href="/employee/new"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Single Upload
        </Link>
      </div>

      {/* Results summary (after upload) */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{successCount} succeeded</span>
              </div>
              {errorCount > 0 && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{errorCount} failed</span>
                </div>
              )}
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {results.map((r) => (
                <div
                  key={r.index}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm border",
                    r.status === "success"
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  )}
                >
                  {r.status === "success" ? (
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate block">
                      {r.title || r.filename}
                    </span>
                    {r.status === "success" && r.amount != null && (
                      <span className="text-xs text-gray-500">
                        {formatCurrencyFull(r.amount, r.currency || "USD")} · {r.category}
                      </span>
                    )}
                    {r.status === "error" && (
                      <span className="text-xs text-red-600">{r.error}</span>
                    )}
                  </div>
                  {r.status === "success" && r.requestId && (
                    <Link
                      href={`/employee/requests/${r.requestId}`}
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      Edit <Edit className="h-3 w-3 inline" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={clearAll}>
                Upload More
              </Button>
              <Link
                href="/employee/requests"
                className={cn(buttonVariants({ variant: "default" }))}
              >
                View All Requests <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload area (before upload or cleared) */}
      {!results && (
        <>
          {/* Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Default Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Save as</Label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as "draft" | "submit")}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="draft">Drafts (review first)</option>
                    <option value="submit">Submit immediately</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Default Currency</Label>
                  <select
                    value={defaultCurrency}
                    onChange={(e) => setDefaultCurrency(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {CURRENCIES.slice(0, 30).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Default Category</Label>
                  <select
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="TRAVEL">Travel</option>
                    <option value="MEALS">Meals</option>
                    <option value="SUPPLIES">Supplies</option>
                    <option value="ACCOMMODATION">Accommodation</option>
                    <option value="COMMUNICATION">Communication</option>
                    <option value="TRAINING">Training</option>
                    <option value="ENTERTAINMENT">Entertainment</option>
                    <option value="MEETING">Meeting</option>
                    <option value="EQUIPMENT">Equipment</option>
                    <option value="PRINTING">Printing</option>
                    <option value="SOFTWARE">Software</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>
              {action === "submit" && (
                <Alert className="mt-3">
                  <AlertDescription className="text-xs">
                    Submitted requests go directly to approvers. Use &quot;Drafts&quot; if you
                    want to review OCR results and correct amounts before submitting.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
            )}
            onClick={() => document.getElementById("bulk-file-input")?.click()}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p className="text-sm font-medium text-gray-600">
              Drag & drop receipts here, or click to browse
            </p>
            <p className="text-xs text-gray-400 mt-1">
              JPEG, PNG, WebP, PDF — up to 20 files, 10MB each
            </p>
            <input
              id="bulk-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ""
              }}
            />
          </div>

          {/* File queue */}
          {files.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {files.length} file{files.length !== 1 ? "s" : ""} queued
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <Trash2 className="h-4 w-4 mr-1" /> Clear all
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="relative group rounded-lg border overflow-hidden bg-gray-50"
                    >
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt={f.file.name}
                          className="w-full h-24 object-cover"
                        />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-red-400" />
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium truncate">{f.file.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {(f.file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(i)
                        }}
                        className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add more button */}
                  <div
                    onClick={() => document.getElementById("bulk-file-input")?.click()}
                    className="rounded-lg border-2 border-dashed border-gray-300 h-24 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <Upload className="h-5 w-5 text-gray-400 mb-1" />
                    <span className="text-xs text-gray-500">Add more</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleUpload}
                    disabled={uploading || files.length === 0}
                    className="flex-1"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {uploading
                      ? "Processing..."
                      : `Upload ${files.length} file${files.length !== 1 ? "s" : ""} as ${action === "draft" ? "Drafts" : "Submitted"}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
