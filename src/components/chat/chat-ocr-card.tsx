"use client"

import { useState } from "react"
import { type DraftRequest } from "@/lib/chat-engine"
import { CheckCircle, ChevronDown } from "lucide-react"

interface ChatOcrCardProps {
  data: { draft: DraftRequest; ocrResult: Record<string, unknown> }
  onConfirm: (draft: DraftRequest) => void
  onEdit: (field: string, value: string | number) => void
}

const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"] as const
const CURRENCIES = ["IDR", "USD", "SGD", "EUR", "GBP"] as const

export function ChatOcrCard({ data, onConfirm, onEdit }: ChatOcrCardProps) {
  const [editing, setEditing] = useState(false)
  const { draft, ocrResult } = data

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-md">
      <div className="flex gap-3 p-4">
        
        {draft.filePreview && (
          <div className="shrink-0">
            <img
              src={draft.filePreview}
              alt="Receipt"
              className="w-20 h-20 rounded-lg object-cover border border-gray-100"
            />
          </div>
        )}

        
        <div className="flex-1 min-w-0 space-y-2">
          
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Source / Title
            </label>
            {editing ? (
              <input
                type="text"
                defaultValue={draft.title}
                onBlur={(e) => onEdit("title", e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <p className="text-sm font-medium text-gray-900 truncate">
                {draft.title}
              </p>
            )}
          </div>

          
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Amount
              </label>
              {editing ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">
                    {draft.currency === "IDR"
                      ? "Rp"
                      : draft.currency === "USD"
                        ? "$"
                        : draft.currency}
                  </span>
                  <input
                    type="number"
                    defaultValue={draft.amount}
                    onBlur={(e) =>
                      onEdit("amount", parseFloat(e.target.value) || 0)
                    }
                    className="w-full text-sm border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-900">
                  {draft.currency}{" "}
                  {draft.amount.toLocaleString()}
                </p>
              )}
            </div>
            <div className="w-20">
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Currency
              </label>
              {editing ? (
                <select
                  defaultValue={draft.currency}
                  onChange={(e) => onEdit("currency", e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-600">{draft.currency}</p>
              )}
            </div>
          </div>

          
          {ocrResult.date ? (
            <div>
              <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                Date
              </label>
              <p className="text-sm text-gray-600">
                {ocrResult.date as string}
              </p>
            </div>
          ) : null}

          
          <div>
            <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Category
            </label>
            {editing ? (
              <select
                defaultValue={draft.category}
                onChange={(e) => onEdit("category", e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-600">
                {draft.category.charAt(0) + draft.category.slice(1).toLowerCase()}
              </p>
            )}
          </div>
        </div>
      </div>

      
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={() => onConfirm(draft)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <CheckCircle className="h-4 w-4" />
          Looks correct
        </button>
        <button
          onClick={() => setEditing(!editing)}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Edit more
          <ChevronDown
            className={`h-3 w-3 transition-transform ${editing ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  )
}
