"use client"

import { type DraftRequest } from "@/lib/chat-engine"
import { Loader2, Save, Send } from "lucide-react"

interface ChatRequestCardProps {
  draft: DraftRequest
  onSaveDraft: () => void
  onSubmit: () => void
  saving?: boolean
}

function formatAmount(amount: number, currency: string): string {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount)
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function ChatRequestCard({
  draft,
  onSaveDraft,
  onSubmit,
  saving,
}: ChatRequestCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-md">
      <div className="p-4 space-y-3">
        {/* Receipt thumbnail */}
        {draft.filePreview && (
          <img
            src={draft.filePreview}
            alt="Receipt"
            className="w-full max-h-32 rounded-lg object-cover border border-gray-100"
          />
        )}

        {/* Details */}
        <div className="space-y-1.5">
          <h4 className="font-semibold text-gray-900">{draft.title}</h4>
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-gray-900">
              {formatAmount(draft.amount, draft.currency)}
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
              {draft.category.charAt(0) + draft.category.slice(1).toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={onSaveDraft}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save as Draft
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Submit Now
        </button>
      </div>
    </div>
  )
}
