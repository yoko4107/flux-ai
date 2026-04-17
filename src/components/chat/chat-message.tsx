"use client"

import { type ChatMessage } from "@/lib/chat-engine"
import { Sparkles } from "lucide-react"
import { type ReactNode } from "react"

function parseContent(content: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /\*\*(.*?)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderNewlines(content.slice(lastIndex, match.index), parts.length))
    }
    parts.push(<strong key={`b-${match.index}`}>{match[1]}</strong>)
    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push(renderNewlines(content.slice(lastIndex), parts.length + 1000))
  }

  return parts
}

function renderNewlines(text: string, keyBase: number): ReactNode {
  const lines = text.split("\n")
  if (lines.length === 1) return text
  return (
    <span key={`nl-${keyBase}`}>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </span>
  )
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

interface ChatMessageProps {
  message: ChatMessage
  onAction?: (action: string) => void
  children?: ReactNode
  userInitials?: string
}

export function ChatMessageBubble({ message, children, userInitials = "U" }: ChatMessageProps) {
  const isUser = message.role === "user"

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="flex flex-col items-end max-w-[80%]">
          {message.type === "file" && message.data?.preview ? (
            <div className="mb-1">
              {typeof message.data.preview === "string" &&
              (message.data.preview as string).startsWith("blob:") ? (
                <img
                  src={message.data.preview as string}
                  alt="Receipt"
                  className="max-w-[200px] max-h-[200px] rounded-xl object-cover"
                />
              ) : (
                <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center">
                  <span className="text-white text-xs">PDF</span>
                </div>
              )}
            </div>
          ) : null}
          {message.type === "text" && message.content && (
            <div className="bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
              {parseContent(message.content)}
            </div>
          )}
          {message.type === "file" && message.content && (
            <div className="bg-gray-800 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
              {message.content}
            </div>
          )}
          <span className="text-[11px] text-gray-400 mt-1 mr-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-white text-xs font-medium">
          {userInitials}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="flex flex-col max-w-[80%]">
        {children ? (
          children
        ) : message.type === "text" && message.content ? (
          <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-800">
            {parseContent(message.content)}
          </div>
        ) : null}
        <span className="text-[11px] text-gray-400 mt-1 ml-1">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}
