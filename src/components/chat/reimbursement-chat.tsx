"use client"

import { useState, useRef, useEffect, useCallback, useReducer } from "react"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Paperclip, Camera, ArrowUp, Sparkles } from "lucide-react"
import {
  type ChatMessage,
  type DraftRequest,
  type ChatState,
  makeId,
  generateGreeting,
  processTextInput,
  processFileInput,
} from "@/lib/chat-engine"
import { ChatMessageBubble } from "./chat-message"
import { ChatOcrCard } from "./chat-ocr-card"
import { ChatRequestCard } from "./chat-request-card"
import { ChatRequestList } from "./chat-request-list"

// ── Reducer ──
type Action =
  | { type: "ADD_MESSAGES"; messages: ChatMessage[] }
  | { type: "SET_DRAFT"; draft: DraftRequest | null }
  | { type: "UPDATE_DRAFT"; updates: Partial<DraftRequest> }
  | { type: "SET_PROCESSING"; value: boolean }
  | { type: "SET_FLAGS"; flags: Partial<Pick<ChatState, "awaitingConfirm" | "awaitingAmount" | "awaitingCategory">> }
  | { type: "SET_USERNAME"; name: string }

const initialState: ChatState = {
  messages: [],
  currentDraft: null,
  awaitingConfirm: false,
  awaitingAmount: false,
  awaitingCategory: false,
  isProcessing: false,
  userName: "there",
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "ADD_MESSAGES":
      return { ...state, messages: [...state.messages, ...action.messages] }
    case "SET_DRAFT":
      return { ...state, currentDraft: action.draft }
    case "UPDATE_DRAFT":
      return { ...state, currentDraft: state.currentDraft ? { ...state.currentDraft, ...action.updates } : action.updates as DraftRequest }
    case "SET_PROCESSING":
      return { ...state, isProcessing: action.value }
    case "SET_FLAGS":
      return { ...state, ...action.flags }
    case "SET_USERNAME":
      return { ...state, userName: action.name }
    default:
      return state
  }
}

// ── Main Component ──
export function ReimbursementChat() {
  const { data: session } = useSession()
  const [state, dispatch] = useReducer(reducer, initialState)
  const [inputText, setInputText] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [initialized, setInitialized] = useState(false)

  const userInitials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  // Greeting on mount
  useEffect(() => {
    if (session?.user?.name && !initialized) {
      const firstName = session.user.name.split(" ")[0]
      dispatch({ type: "SET_USERNAME", name: firstName })
      dispatch({ type: "ADD_MESSAGES", messages: [generateGreeting(firstName)] })
      setInitialized(true)
    }
  }, [session, initialized])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [state.messages, state.isProcessing])

  // ── Handle text input ──
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText("")

    // Add user message
    dispatch({
      type: "ADD_MESSAGES",
      messages: [{ id: makeId(), role: "user", type: "text", content: text, timestamp: new Date() }],
    })

    // Process
    dispatch({ type: "SET_PROCESSING", value: true })

    const result = processTextInput(text, state)

    // Handle API actions
    if (result.apiAction) {
      try {
        if (result.apiAction.type === "fetch_requests") {
          const res = await fetch("/api/requests")
          if (res.ok) {
            const requests = await res.json()
            dispatch({
              type: "ADD_MESSAGES",
              messages: [{
                id: makeId(), role: "assistant", type: "request_list",
                content: `Here are your recent requests:`,
                data: { requests },
                timestamp: new Date(),
              }],
            })
          }
        } else if (result.apiAction.type === "fetch_stats") {
          const res = await fetch("/api/requests")
          if (res.ok) {
            const requests = await res.json()
            const byStatus: Record<string, { count: number; total: number }> = {}
            for (const r of requests) {
              const s = r.status as string
              if (!byStatus[s]) byStatus[s] = { count: 0, total: 0 }
              byStatus[s].count++
              byStatus[s].total += Number(r.amountIDR || r.amount || 0)
            }
            const grandTotal = requests.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.amountIDR || r.amount || 0), 0)
            const fmtIDR = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

            let statsText = `**Your reimbursement summary:**\n\n`
            for (const [status, { count, total }] of Object.entries(byStatus)) {
              statsText += `**${status.replace(/_/g, " ")}**: ${count} request${count !== 1 ? "s" : ""} (${fmtIDR(total)})\n`
            }
            statsText += `\n**Grand Total**: ${fmtIDR(grandTotal)}`

            dispatch({
              type: "ADD_MESSAGES",
              messages: [{ id: makeId(), role: "assistant", type: "text", content: statsText, timestamp: new Date() }],
            })
          }
        } else if (result.apiAction.type === "submit_drafts") {
          const res = await fetch("/api/requests?status=DRAFT")
          if (res.ok) {
            const drafts = await res.json()
            if (drafts.length === 0) {
              dispatch({ type: "ADD_MESSAGES", messages: [{ id: makeId(), role: "assistant", type: "text", content: "You don't have any draft requests to submit.", timestamp: new Date() }] })
            } else {
              let submitted = 0
              for (const d of drafts) {
                const patchRes = await fetch(`/api/requests/${d.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "SUBMITTED" }),
                })
                if (patchRes.ok) submitted++
              }
              dispatch({
                type: "ADD_MESSAGES",
                messages: [{ id: makeId(), role: "assistant", type: "status_update", content: `Submitted ${submitted} of ${drafts.length} draft request${drafts.length !== 1 ? "s" : ""} for approval!`, timestamp: new Date() }],
              })
            }
          }
        }
      } catch {
        dispatch({ type: "ADD_MESSAGES", messages: [{ id: makeId(), role: "assistant", type: "text", content: "Sorry, something went wrong. Please try again.", timestamp: new Date() }] })
      }
    }

    // Add messages from engine
    if (result.messages.length > 0) {
      dispatch({ type: "ADD_MESSAGES", messages: result.messages })
    }

    // Update draft
    if (result.draftUpdate !== undefined) {
      if (result.draftUpdate === null) {
        dispatch({ type: "SET_DRAFT", draft: null })
      } else {
        dispatch({ type: "UPDATE_DRAFT", updates: result.draftUpdate })
      }
    }

    // Update flags
    if (result.stateUpdates) {
      dispatch({ type: "SET_FLAGS", flags: result.stateUpdates })
    }

    dispatch({ type: "SET_PROCESSING", value: false })
  }, [inputText, state])

  // ── Handle file input ──
  const handleFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
      if (!validTypes.includes(file.type)) continue

      // Create preview
      const preview = file.type !== "application/pdf" ? URL.createObjectURL(file) : undefined

      // Add user file message
      dispatch({
        type: "ADD_MESSAGES",
        messages: [{
          id: makeId(), role: "user", type: "file",
          content: file.name,
          data: { preview, fileName: file.name, fileSize: file.size },
          timestamp: new Date(),
        }],
      })

      dispatch({ type: "SET_PROCESSING", value: true })

      try {
        // Upload + OCR in parallel
        const uploadPromise = (async () => {
          const fd = new FormData()
          fd.append("file", file)
          const res = await fetch("/api/upload/receipt", { method: "POST", body: fd })
          if (!res.ok) throw new Error("Upload failed")
          return (await res.json()).url as string
        })()

        let ocrResult: Record<string, unknown> | undefined
        if (file.type !== "application/pdf") {
          try {
            const { runClientOCR } = await import("@/lib/client-ocr")
            ocrResult = await runClientOCR(file) as unknown as Record<string, unknown>
          } catch {
            // OCR failed, non-fatal
          }
        }

        const receiptUrl = await uploadPromise
        const result = processFileInput(receiptUrl, ocrResult, preview)

        if (result.messages.length > 0) dispatch({ type: "ADD_MESSAGES", messages: result.messages })
        if (result.draftUpdate) dispatch({ type: "UPDATE_DRAFT", updates: result.draftUpdate })
        if (result.stateUpdates) dispatch({ type: "SET_FLAGS", flags: result.stateUpdates })
      } catch {
        dispatch({
          type: "ADD_MESSAGES",
          messages: [{ id: makeId(), role: "assistant", type: "text", content: "Failed to upload that file. Please try again.", timestamp: new Date() }],
        })
      }

      dispatch({ type: "SET_PROCESSING", value: false })
    }
  }, [])

  // ── Handle OCR confirm ──
  const handleOcrConfirm = useCallback((draft: DraftRequest) => {
    dispatch({ type: "SET_DRAFT", draft })
    dispatch({ type: "SET_FLAGS", flags: { awaitingConfirm: false } })
    dispatch({
      type: "ADD_MESSAGES",
      messages: [{
        id: makeId(), role: "assistant", type: "request_summary",
        content: "Here's your request. Save it or submit directly:",
        data: { draft: draft as unknown as Record<string, unknown> },
        timestamp: new Date(),
      }],
    })
  }, [])

  // ── Handle save/submit ──
  const handleSaveRequest = useCallback(async (status: "DRAFT" | "SUBMITTED") => {
    if (!state.currentDraft) return
    setSaving(true)

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.currentDraft.title,
          description: "",
          amount: state.currentDraft.amount,
          currency: state.currentDraft.currency,
          category: state.currentDraft.category,
          receiptUrl: state.currentDraft.receiptUrl,
          parsedData: state.currentDraft.parsedData,
          status,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        const details = json.details?.join(", ") || json.error || "Save failed"
        dispatch({
          type: "ADD_MESSAGES",
          messages: [{ id: makeId(), role: "assistant", type: "text", content: `Oops: ${details}`, timestamp: new Date() }],
        })
      } else {
        const action = status === "DRAFT" ? "saved as draft" : "submitted for approval"
        dispatch({
          type: "ADD_MESSAGES",
          messages: [{
            id: makeId(), role: "assistant", type: "status_update",
            content: `Done! Your request "${state.currentDraft.title}" has been **${action}**.\n\nUpload another receipt or type a new expense!`,
            timestamp: new Date(),
          }],
        })
        dispatch({ type: "SET_DRAFT", draft: null })
        dispatch({ type: "SET_FLAGS", flags: { awaitingConfirm: false, awaitingAmount: false, awaitingCategory: false } })
        toast.success(status === "DRAFT" ? "Saved as draft!" : "Request submitted!")
      }
    } catch {
      dispatch({
        type: "ADD_MESSAGES",
        messages: [{ id: makeId(), role: "assistant", type: "text", content: "Something went wrong. Please try again.", timestamp: new Date() }],
      })
    }

    setSaving(false)
  }, [state.currentDraft])

  // ── Drag and drop ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files))
    }
  }, [handleFiles])

  // ── Render ──
  return (
    <div className="flex flex-col h-full relative">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false)
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {state.messages.map((m) => {
            // OCR result card
            if (m.type === "ocr_result" && m.data) {
              return (
                <ChatMessageBubble key={m.id} message={m} userInitials={userInitials}>
                  <p className="mb-3">{m.content}</p>
                  <ChatOcrCard
                    data={m.data as { draft: DraftRequest; ocrResult: Record<string, unknown> }}
                    onConfirm={handleOcrConfirm}
                    onEdit={(field, value) => {
                      dispatch({ type: "UPDATE_DRAFT", updates: { [field]: value } })
                    }}
                  />
                </ChatMessageBubble>
              )
            }

            // Request summary card
            if (m.type === "request_summary" && m.data?.draft) {
              return (
                <ChatMessageBubble key={m.id} message={m} userInitials={userInitials}>
                  <p className="mb-3">{m.content}</p>
                  <ChatRequestCard
                    draft={m.data.draft as unknown as DraftRequest}
                    onSaveDraft={() => handleSaveRequest("DRAFT")}
                    onSubmit={() => handleSaveRequest("SUBMITTED")}
                    saving={saving}
                  />
                </ChatMessageBubble>
              )
            }

            // Request list
            if (m.type === "request_list" && m.data?.requests) {
              return (
                <ChatMessageBubble key={m.id} message={m} userInitials={userInitials}>
                  <p className="mb-3">{m.content}</p>
                  <ChatRequestList requests={m.data.requests as Array<{id:string;title:string;amount:string;currency:string;amountIDR:string|null;status:string;month:string|null;createdAt:string}>} />
                </ChatMessageBubble>
              )
            }

            // Status update (with check icon styling)
            if (m.type === "status_update") {
              return (
                <ChatMessageBubble key={m.id} message={{...m, type: "text"}} userInitials={userInitials} />
              )
            }

            // Default text/file
            return <ChatMessageBubble key={m.id} message={m} userInitials={userInitials} />
          })}

          {/* Typing indicator */}
          {state.isProcessing && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-white px-6 py-4 rounded-xl shadow-lg">
            <p className="text-blue-600 font-medium text-lg">Drop receipts here</p>
            <p className="text-blue-400 text-sm">Images or PDFs</p>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t bg-white">
        <div className="max-w-3xl mx-auto p-3">
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(Array.from(e.target.files))
                e.target.value = ""
              }}
            />

            <button
              onClick={() => cameraRef.current?.click()}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="Take photo"
            >
              <Camera className="h-5 w-5" />
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(Array.from(e.target.files))
                e.target.value = ""
              }}
            />

            <div className="flex-1">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Upload a receipt or describe your expense..."
                rows={1}
                disabled={state.isProcessing}
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white disabled:opacity-50 transition-all"
                style={{ maxHeight: "120px" }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={state.isProcessing || !inputText.trim()}
              className="p-2.5 bg-gray-800 text-white rounded-full hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
