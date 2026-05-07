"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"

// Public token-action page. Reached when a recipient clicks an
// approve/reject/agree/disagree link in their email. Verifies the token
// server-side, then either:
//   - executes the action and shows a confirmation, or
//   - renders the rejection-reason / counter-proposal form when one is required.

type PeekResponse =
  | { ok: true; action: string; resourceId: string; resourceType: string }
  | { error: string }

export default function LeaveActionPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const token = sp.get("t") ?? ""

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "expired" }
    | { kind: "ready"; action: string }
    | { kind: "needs-reason"; action: "REJECT_LEAVE" }
    | { kind: "needs-counter" }
    | { kind: "done"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" })
  const [reason, setReason] = useState("")
  const [counter, setCounter] = useState({ proposedStart: "", proposedEnd: "", message: "" })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) {
      setState({ kind: "error", message: "Missing link token." })
      return
    }
    fetch(`/api/leave/action?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: PeekResponse) => {
        if ("error" in data) {
          setState({ kind: "expired" })
          return
        }
        // For actions that just execute, run them now. For ones that need
        // user input (reject reason / counter dates), show the form first.
        if (data.action === "REJECT_LEAVE") {
          setState({ kind: "needs-reason", action: "REJECT_LEAVE" })
          return
        }
        if (data.action === "DISAGREE_PROPOSAL") {
          setState({ kind: "needs-counter" })
          return
        }
        // APPROVE / AGREE — execute immediately.
        execute({})
      })
      .catch(() => setState({ kind: "error", message: "Network error." }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function execute(payload: Record<string, string>) {
    setBusy(true)
    try {
      const res = await fetch("/api/leave/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === "ALREADY_USED") {
          setState({ kind: "expired" })
        } else if (data.error === "REJECTION_REASON_REQUIRED") {
          setState({ kind: "needs-reason", action: "REJECT_LEAVE" })
        } else {
          setState({ kind: "error", message: data.error || "Failed." })
        }
        return
      }
      setState({ kind: "done", message: "Action recorded." })
      // If a session exists we'd ideally redirect to the portal; here we just
      // expose a button.
      void router
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-lg w-full p-8">
        <div className="mb-6">
          <div className="text-xs font-semibold text-gray-500 tracking-wider uppercase">FLUX.AI · Leave</div>
          <h1 className="text-2xl font-semibold text-gray-900 mt-1">Email Action</h1>
        </div>

        {state.kind === "loading" && <p className="text-sm text-gray-600">Verifying link…</p>}

        {state.kind === "expired" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              This link has expired or has already been used. Please log into the portal to take action.
            </p>
            <a
              href="/employee/leave"
              className="inline-block px-4 py-2 rounded-lg bg-[#0B1E3F] text-white text-sm font-medium"
            >
              Open Portal
            </a>
          </div>
        )}

        {state.kind === "needs-reason" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (reason.trim().length < 20) return
              execute({ rejectionReason: reason.trim() })
            }}
            className="space-y-4"
          >
            <p className="text-sm text-gray-700">
              You&apos;re rejecting this leave request. Please tell the employee why — they&apos;ll see this message.
            </p>
            <textarea
              required
              minLength={20}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              placeholder="At least 20 characters…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{reason.trim().length} / 20 minimum</span>
              <button
                type="submit"
                disabled={busy || reason.trim().length < 20}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send Rejection"}
              </button>
            </div>
          </form>
        )}

        {state.kind === "needs-counter" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (counter.message.trim().length < 20) return
              execute({
                proposedStart: counter.proposedStart,
                proposedEnd: counter.proposedEnd,
                message: counter.message.trim(),
              })
            }}
            className="space-y-4"
          >
            <p className="text-sm text-gray-700">Suggest different dates and explain why.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">
                Start date
                <input
                  required
                  type="date"
                  value={counter.proposedStart}
                  onChange={(e) => setCounter((c) => ({ ...c, proposedStart: e.target.value }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-gray-500">
                End date
                <input
                  required
                  type="date"
                  value={counter.proposedEnd}
                  onChange={(e) => setCounter((c) => ({ ...c, proposedEnd: e.target.value }))}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <textarea
              required
              minLength={20}
              maxLength={2000}
              rows={4}
              value={counter.message}
              onChange={(e) => setCounter((c) => ({ ...c, message: e.target.value }))}
              placeholder="Why are these dates better? (≥20 chars)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              disabled={busy || counter.message.trim().length < 20}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send Counter-Proposal"}
            </button>
          </form>
        )}

        {state.kind === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">{state.message} Thank you — you can close this tab.</p>
            <a
              href="/employee/leave"
              className="inline-block px-4 py-2 rounded-lg bg-[#0B1E3F] text-white text-sm font-medium"
            >
              Open Portal
            </a>
          </div>
        )}

        {state.kind === "error" && (
          <p className="text-sm text-red-600">{state.message}</p>
        )}
      </div>
    </div>
  )
}
