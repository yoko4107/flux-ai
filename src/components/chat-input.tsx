"use client"

import { useState, useRef, useCallback } from "react"
import { Paperclip, Camera, Send, X, Loader2, FileText } from "lucide-react"
import { runClientOCR, type OcrResult } from "@/lib/client-ocr"

interface ChatInputProps {
  onSubmit: (data: { title: string; file?: File; ocrResult?: OcrResult }) => void
  uploading?: boolean
  parsing?: boolean
}

export function ChatInput({ onSubmit, uploading, parsing }: ChatInputProps) {
  const [title, setTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isPdf, setIsPdf] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const isBusy = uploading || parsing || ocrRunning

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setIsPdf(selectedFile.type === "application/pdf")
    setOcrResult(null)

    if (selectedFile.type !== "application/pdf") {
      setPreview(URL.createObjectURL(selectedFile))
      // Auto-run OCR
      setOcrRunning(true)
      try {
        const result = await runClientOCR(selectedFile)
        setOcrResult(result)
        if (result.source && !title) {
          setTitle(result.source)
        }
      } catch {
        // OCR failed silently, user can still fill manually
      } finally {
        setOcrRunning(false)
      }
    } else {
      setPreview(null)
    }
  }, [title])

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setIsPdf(false)
    setOcrResult(null)
  }

  const handleSubmit = () => {
    if (!title.trim() && !file) return
    onSubmit({
      title: title.trim(),
      file: file ?? undefined,
      ocrResult: ocrResult ?? undefined,
    })
    setTitle("")
    clearFile()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:static md:border md:rounded-xl md:shadow-sm">
      {/* File preview floating above input */}
      {file && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm max-w-xs">
            {preview ? (
              <img
                src={preview}
                alt="Receipt preview"
                className="h-12 w-12 rounded object-cover"
              />
            ) : isPdf ? (
              <FileText className="h-8 w-8 text-red-500 shrink-0" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-700">
                {file.name}
              </p>
              <p className="text-[10px] text-gray-400">
                {(file.size / 1024).toFixed(0)} KB
              </p>
              {ocrRunning && (
                <p className="text-[10px] text-blue-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Parsing...
                </p>
              )}
              {ocrResult && !ocrRunning && (
                <p className="text-[10px] text-green-600">Parsed</p>
              )}
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="absolute -top-2 -right-2 rounded-full bg-gray-600 p-0.5 text-white hover:bg-gray-800 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-end gap-1.5 p-3 sm:gap-2">
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileSelected(f)
            e.target.value = ""
          }}
        />

        {/* Camera button */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isBusy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
          title="Take photo"
        >
          <Camera className="h-5 w-5" />
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileSelected(f)
            e.target.value = ""
          }}
        />

        {/* Text input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a title or description..."
            disabled={isBusy}
            className="w-full rounded-full border border-gray-300 bg-gray-100 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          />
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isBusy || (!title.trim() && !file)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600 transition-colors disabled:bg-gray-300 disabled:text-gray-500"
          title="Send"
        >
          {isBusy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  )
}
