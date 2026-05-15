"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Loader2, Plus, Save, Trash2, Building2, Users as UsersIcon,
  Power, UserPlus, X, ChevronDown, ChevronRight, Upload, FolderOpen, HardDrive,
} from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const STATUS_CLASSES = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  PENDING: "bg-yellow-100 text-yellow-700",
}
function StatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" | "PENDING" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

type CostCenter = {
  id: string
  code: string
  name: string
  countryCode: string
  currency: string
  active: boolean
  createdAt: string
  _count: { users: number }
}

type UserRow = {
  id: string
  name: string | null
  email: string
  role: string
  status: "ACTIVE" | "INACTIVE" | "PENDING"
  department: string | null
  hireDate: string | null
  driveFolderId: string | null
  costCenterId: string | null
  costCenter: { id: string; code: string; name: string; currency: string } | null
  organizationId: string | null
}

const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const
type Role = typeof ROLES[number]

function parseCSV(text: string): { email: string; role: Role; phone?: string }[] {
  const lines = text.trim().split("\n").filter(Boolean)
  const results: { email: string; role: Role; phone?: string }[] = []
  for (const line of lines) {
    if (line.startsWith("#") || line.toLowerCase().startsWith("email")) continue
    const [email, role, phone] = line.split(",").map((s) => s.trim())
    if (!email || !email.includes("@")) continue
    const validRole = ROLES.includes((role?.toUpperCase() ?? "") as Role) ? (role.toUpperCase() as Role) : "EMPLOYEE"
    results.push({ email, role: validRole, phone: phone || undefined })
  }
  return results
}

type DriveStatus = { connected: boolean; rootFolderUrl: string | null }

export default function CostCentersPage() {
  const [items, setItems] = useState<CostCenter[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [drive, setDrive] = useState<DriveStatus>({ connected: false, rootFolderUrl: null })

  // Bulk upload — scoped to a specific cost center
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCostCenter, setBulkCostCenter] = useState<CostCenter | null>(null)
  const [csvText, setCsvText] = useState("")
  const [parsed, setParsed] = useState<{ email: string; role: Role; phone?: string }[]>([])
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<{ email: string; status: string; link?: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [bulkTab, setBulkTab] = useState<"csv" | "sheets">("csv")
  const [sheetsUrl, setSheetsUrl] = useState("")
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [sheetsError, setSheetsError] = useState("")

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cc, u, ds] = await Promise.all([
        fetch("/api/admin/cost-centers").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/google-drive/status").then((r) => r.json()).catch(() => ({ connected: false, rootFolderUrl: null })),
      ])
      setItems(cc.costCenters ?? [])
      setUsers(Array.isArray(u) ? u : [])
      setDrive({ connected: ds.connected ?? false, rootFolderUrl: ds.rootFolderUrl ?? null })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("driveConnected")) {
      toast.success("Google Drive connected successfully")
      window.history.replaceState({}, "", window.location.pathname)
    } else if (params.get("driveError")) {
      toast.error("Failed to connect Google Drive")
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  async function save(id: string, patch: Partial<CostCenter>) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/cost-centers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Save failed")
      } else {
        await fetchAll()
      }
    } finally { setBusy(null) }
  }

  async function remove(cc: CostCenter) {
    if (cc._count.users > 0) {
      if (!confirm(`Delete "${cc.name}"? ${cc._count.users} user(s) will revert to the org base currency.`)) return
    } else if (!confirm(`Delete "${cc.name}"?`)) return
    setBusy(cc.id)
    try {
      const res = await fetch(`/api/admin/cost-centers/${cc.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Delete failed")
      } else {
        await fetchAll()
      }
    } finally { setBusy(null) }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvText(text)
      setParsed(parseCSV(text))
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (csvText) setParsed(parseCSV(csvText))
  }, [csvText])

  async function fetchFromSheets() {
    if (!sheetsUrl.trim()) return
    setSheetsLoading(true)
    setSheetsError("")
    try {
      const res = await fetch("/api/admin/google-sheets-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetsUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSheetsError(data.error ?? "Failed to fetch sheet")
        return
      }
      const rows = data.rows as { email: string; role: Role; phone?: string; name?: string }[]
      const csvLines = rows.map((r) => `${r.email},${r.role}${r.phone ? `,${r.phone}` : ""}`).join("\n")
      setCsvText(csvLines)
      setParsed(rows.map((r) => ({ email: r.email, role: r.role, phone: r.phone })))
      setBulkTab("csv")
      toast.success(`${rows.length} row${rows.length !== 1 ? "s" : ""} imported from Google Sheet`)
    } finally {
      setSheetsLoading(false)
    }
  }

  async function handleBulkSend() {
    if (parsed.length === 0) { toast.error("No valid rows to send"); return }
    setSending(true)
    setResults([])
    const res = await fetch("/api/admin/invitations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: parsed, costCenterId: bulkCostCenter?.id }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) {
      setResults(data.results)
      const sent = data.results.filter((r: { status: string }) => r.status === "invited").length
      toast.success(`${sent} invitation${sent !== 1 ? "s" : ""} sent`)
    } else {
      toast.error(data.error ?? "Failed to send invitations")
    }
  }

  function openBulkFor(cc: CostCenter) {
    setBulkCostCenter(cc)
    setCsvText("")
    setParsed([])
    setResults([])
    setBulkTab("csv")
    setSheetsUrl("")
    setSheetsError("")
    setBulkOpen(true)
  }

  return (
    <div className="max-w-5xl space-y-5 p-1">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Cost Center</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Each cost center is a regional office with its own currency. Employees are managed directly under
            their cost center. Approver and Finance roles are assigned in{" "}
            <a href="/admin/config" className="underline text-blue-600 hover:text-blue-800">Configuration</a>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {drive.connected ? (
            <a
              href={drive.rootFolderUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
            >
              <HardDrive className="h-3.5 w-3.5" /> Drive connected
            </a>
          ) : (
            <a
              href="/api/admin/google-drive/connect"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <HardDrive className="h-3.5 w-3.5" /> Connect Google Drive
            </a>
          )}
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-3.5 w-3.5" /> New cost center
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {adding && (
            <NewCostCenterCard
              onCancel={() => setAdding(false)}
              onSaved={() => { setAdding(false); fetchAll() }}
            />
          )}
          {items.length === 0 && !adding && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <Building2 className="mx-auto h-8 w-8 text-gray-300" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No cost centers yet</h3>
              <p className="mt-1 text-sm text-gray-500">Create one for each regional office. Start with the most active.</p>
            </div>
          )}
          {items.map((cc) => (
            <CostCenterCard
              key={cc.id}
              cc={cc}
              users={users.filter((u) => u.costCenterId === cc.id)}
              busy={busy === cc.id}
              driveConnected={drive.connected}
              onSave={(patch) => save(cc.id, patch)}
              onDelete={() => remove(cc)}
              onRefresh={fetchAll}
              onBulkUpload={() => openBulkFor(cc)}
            />
          ))}
        </div>
      )}

      <UnassignedUsers
        users={users.filter((u) => !u.costCenterId && u.role === "EMPLOYEE")}
        costCenters={items}
        onAssigned={fetchAll}
      />

      {/* Bulk Upload Dialog — scoped to a specific cost center */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Bulk Invite Users
              {bulkCostCenter && (
                <span className="ml-2 font-normal text-sm text-gray-500">
                  — <span className="font-mono text-xs text-gray-400">{bulkCostCenter.code}</span>{" "}
                  {bulkCostCenter.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
              <button
                onClick={() => setBulkTab("csv")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  bulkTab === "csv" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                CSV / Paste
              </button>
              <button
                onClick={() => setBulkTab("sheets")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                  bulkTab === "sheets" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <svg className="h-3.5 w-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                Google Sheet
              </button>
            </div>

            {bulkTab === "sheets" ? (
              <div className="space-y-3">
                <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700 space-y-1">
                  <p className="font-medium">Google Sheet requirements:</p>
                  <p>• Sheet must be shared as <strong>"Anyone with the link can view"</strong></p>
                  <p>• Columns: <code className="font-mono bg-green-100 px-1 rounded">email, role, phone (optional)</code></p>
                  <p>• Or: <code className="font-mono bg-green-100 px-1 rounded">name, email, role, phone (optional)</code></p>
                  <p>• Roles: EMPLOYEE, APPROVER, FINANCE, ADMIN</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Google Sheets URL</label>
                  <input
                    type="url"
                    value={sheetsUrl}
                    onChange={(e) => { setSheetsUrl(e.target.value); setSheetsError("") }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  {sheetsError && <p className="text-xs text-red-600">{sheetsError}</p>}
                </div>
                <button
                  onClick={fetchFromSheets}
                  disabled={sheetsLoading || !sheetsUrl.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {sheetsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                    </svg>
                  )}
                  {sheetsLoading ? "Fetching…" : "Import from Sheet"}
                </button>
              </div>
            ) : (
              <>
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                  <p className="font-medium">CSV format:</p>
                  <code className="block font-mono">email,role,phone (optional)</code>
                  <code className="block font-mono text-gray-500">john@company.com,EMPLOYEE,+628123456789</code>
                  <code className="block font-mono text-gray-500">sarah@company.com,APPROVER</code>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload CSV file
                  </button>
                  <span className="text-xs text-gray-400">or paste below</span>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="sr-only" onChange={handleFileUpload} />
                </div>

                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full h-32 text-xs font-mono border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  placeholder={"email,role\njohn@company.com,EMPLOYEE\nsarah@company.com,APPROVER"}
                />
              </>
            )}

            {parsed.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-600 mb-2">{parsed.length} user{parsed.length !== 1 ? "s" : ""} parsed:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {parsed.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-800">{p.email}</span>
                      <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px]">{p.role}</span>
                      {p.phone && <span className="text-gray-400">{p.phone}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-600">Results:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={r.status === "invited" ? "text-green-600" : "text-gray-400"}>
                        {r.status === "invited" ? "✓" : "—"}
                      </span>
                      <span>{r.email}</span>
                      {r.status === "skipped" && <span className="text-gray-400">(already exists)</span>}
                      {r.link && (
                        <button onClick={() => { navigator.clipboard.writeText(r.link!); toast.success("Copied!") }} className="text-blue-500 hover:underline">
                          copy link
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Close</Button>
            <Button onClick={handleBulkSend} disabled={sending || parsed.length === 0}>
              {sending ? "Sending..." : `Send ${parsed.length > 0 ? parsed.length : ""} Invite${parsed.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CostCenterCard({
  cc,
  users,
  busy,
  driveConnected,
  onSave,
  onDelete,
  onRefresh,
  onBulkUpload,
}: {
  cc: CostCenter
  users: UserRow[]
  busy: boolean
  driveConnected: boolean
  onSave: (patch: Partial<CostCenter>) => void
  onDelete: () => void
  onRefresh: () => void
  onBulkUpload: () => void
}) {
  const [draft, setDraft] = useState({ name: cc.name, countryCode: cc.countryCode, currency: cc.currency, active: cc.active })
  useEffect(() => setDraft({ name: cc.name, countryCode: cc.countryCode, currency: cc.currency, active: cc.active }), [cc])
  const dirty = draft.name !== cc.name || draft.countryCode !== cc.countryCode || draft.currency !== cc.currency || draft.active !== cc.active

  const [membersOpen, setMembersOpen] = useState(true)
  const [addingMember, setAddingMember] = useState(false)
  const [editMember, setEditMember] = useState<UserRow | null>(null)
  const [deletingUser, setDeletingUser] = useState<string | null>(null)

  async function deleteUser(u: UserRow) {
    if (!confirm(`Delete ${u.name ?? u.email}? This cannot be undone.`)) return
    setDeletingUser(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Delete failed")
      } else {
        onRefresh()
      }
    } finally {
      setDeletingUser(null)
    }
  }

  const employees = useMemo(() => users.filter((u) => u.role === "EMPLOYEE"), [users])

  return (
    <article className={`rounded-xl border bg-white ${cc.active ? "border-gray-200" : "border-gray-200 opacity-75"}`}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-gray-500" />
          <span className="font-mono text-xs uppercase text-gray-500">{cc.code}</span>
          <span className="text-sm font-semibold text-gray-900">{cc.name}</span>
          {!cc.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">inactive</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            <UsersIcon className="inline h-3.5 w-3.5 align-text-bottom mr-1" />
            {cc._count.users} {cc._count.users === 1 ? "user" : "users"}
          </span>
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
            title="Delete cost center"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Settings */}
      <div className="grid gap-3 px-5 py-4 md:grid-cols-4">
        <label className="block md:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Name</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Country (ISO-2)</span>
          <input
            value={draft.countryCode}
            onChange={(e) => setDraft({ ...draft, countryCode: e.target.value.toUpperCase().slice(0, 2) })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
            placeholder="ID"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Currency (ISO-4217)</span>
          <input
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase().slice(0, 3) })}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
            placeholder="IDR"
          />
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <Power className="h-3.5 w-3.5 text-gray-500" />
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Active
        </label>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-700">Unsaved</span>}
          <button
            onClick={() => onSave(draft)}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>
      </div>

      {/* Members section */}
      <div className="border-t border-gray-100">
        <div className="flex w-full items-center justify-between px-5 py-3">
          <button
            className="flex items-center gap-2 text-left hover:opacity-70"
            onClick={() => setMembersOpen((v) => !v)}
          >
            <UsersIcon className="h-3.5 w-3.5 text-gray-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Employees ({employees.length})
            </span>
            {membersOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onBulkUpload}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <Upload className="h-3 w-3" /> Bulk Upload
            </button>
            <button
              onClick={() => { setAddingMember(true); setMembersOpen(true) }}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              <UserPlus className="h-3 w-3" /> Add employee
            </button>
          </div>
        </div>

        {membersOpen && (
          <div className="pb-3">
            {addingMember && (
              <div className="px-5 pb-2">
                <AddMemberForm
                  costCenterId={cc.id}
                  onCancel={() => setAddingMember(false)}
                  onSaved={() => { setAddingMember(false); onRefresh() }}
                />
              </div>
            )}
            {employees.length === 0 && !addingMember ? (
              <p className="px-5 py-3 text-xs text-gray-400">No employees yet. Click "Add employee" to get started.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-medium text-gray-500">Name</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Email</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Department</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Hire Date</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {employees.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/60">
                        {editMember?.id === u.id ? (
                          <td colSpan={6} className="px-5 py-2">
                            <EditMemberRow
                              user={u}
                              driveConnected={driveConnected}
                              onCancel={() => setEditMember(null)}
                              onSaved={() => { setEditMember(null); onRefresh() }}
                              onRemove={() => { setEditMember(null); onRefresh() }}
                            />
                          </td>
                        ) : (
                          <>
                            <td className="px-5 py-2.5 font-medium text-gray-900">{u.name ?? "—"}</td>
                            <td className="px-4 py-2.5 text-gray-500">{u.email}</td>
                            <td className="px-4 py-2.5 text-gray-500">{u.department ?? "—"}</td>
                            <td className="px-4 py-2.5 text-gray-500">
                              {u.hireDate ? new Date(u.hireDate).toLocaleDateString() : "—"}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={u.status} />
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {u.driveFolderId ? (
                                  <a
                                    href={`https://drive.google.com/drive/folders/${u.driveFolderId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded p-1.5 text-green-600 border border-green-200 hover:bg-green-50"
                                    title="Open Drive folder"
                                  >
                                    <FolderOpen className="h-3 w-3" />
                                  </a>
                                ) : null}
                                <button
                                  onClick={() => setEditMember(u)}
                                  className="rounded px-2 py-1 text-xs text-gray-500 border border-gray-200 hover:bg-gray-100"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteUser(u)}
                                  disabled={deletingUser === u.id}
                                  className="rounded p-1.5 text-red-400 border border-red-200 hover:bg-red-50 disabled:opacity-50"
                                  title="Delete user"
                                >
                                  {deletingUser === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function AddMemberForm({ costCenterId, onCancel, onSaved }: { costCenterId: string; onCancel: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<Role>("EMPLOYEE")
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!email) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/invitations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invites: [{ email, phone: phone || undefined, role }], costCenterId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to send invitation")
      } else {
        const result = data.results?.[0]
        if (result?.status === "skipped") {
          toast.error("This email already has an account or pending invite")
        } else {
          toast.success("Invitation sent")
          onSaved()
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700">Invite employee</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          placeholder="Email *"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        >
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={send}
          disabled={busy || !email}
          className="inline-flex items-center gap-1 rounded-md bg-[#0B1E3F] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />} Send Invite
        </button>
      </div>
    </div>
  )
}

function EditMemberRow({ user, driveConnected, onCancel, onSaved, onRemove }: {
  user: UserRow
  driveConnected: boolean
  onCancel: () => void
  onSaved: () => void
  onRemove: () => void
}) {
  const [name, setName] = useState(user.name ?? "")
  const [department, setDepartment] = useState(user.department ?? "")
  const [hireDate, setHireDate] = useState(
    user.hireDate ? user.hireDate.slice(0, 10) : ""
  )
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "PENDING">(user.status)
  const [busy, setBusy] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderId, setFolderId] = useState(user.driveFolderId)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          department: department || null,
          hireDate: hireDate || null,
          status,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Save failed")
      } else {
        onSaved()
      }
    } finally {
      setBusy(false)
    }
  }

  async function removeFromCenter() {
    if (!confirm(`Remove ${user.name ?? user.email} from this cost center?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCenterId: null }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Failed")
      } else {
        onRemove()
      }
    } finally {
      setBusy(false)
    }
  }

  async function createDriveFolder() {
    setCreatingFolder(true)
    try {
      const res = await fetch(`/api/admin/google-drive/employee/${user.id}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create Drive folder")
      } else {
        setFolderId(data.folderId)
        toast.success("Drive folder created")
      }
    } finally {
      setCreatingFolder(false)
    }
  }

  return (
    <div className="my-1 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
      <div className="grid gap-2 sm:grid-cols-4">
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <input
          placeholder="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        />
        <div>
          <label className="block text-[10px] text-gray-500 mb-0.5">Hire Date</label>
          <input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE" | "PENDING")}
          className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
        >
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING">Pending</option>
        </select>
      </div>

      {/* Drive folder row */}
      <div className="mt-2 flex items-center gap-2">
        {folderId ? (
          <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-green-700 hover:underline"
          >
            <FolderOpen className="h-3 w-3" /> Open Drive folder
          </a>
        ) : driveConnected ? (
          <button
            onClick={createDriveFolder}
            disabled={creatingFolder}
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {creatingFolder ? <Loader2 className="h-3 w-3 animate-spin" /> : <HardDrive className="h-3 w-3" />}
            {creatingFolder ? "Creating…" : "Create Drive folder"}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">Connect Google Drive to manage employee folders</span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={removeFromCenter}
          disabled={busy}
          className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-50"
        >
          Remove from center
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50">
            <X className="h-3 w-3" />
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md bg-[#0B1E3F] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </button>
        </div>
      </div>
    </div>
  )
}

function NewCostCenterCard({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [countryCode, setCountryCode] = useState("")
  const [currency, setCurrency] = useState("")
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), name, countryCode: countryCode.toUpperCase(), currency: currency.toUpperCase() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Create failed")
      } else { onSaved() }
    } finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-5">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 32))}
            placeholder="ID-HQ"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Indonesia HQ"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Country</span>
          <input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="ID"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Currency</span>
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="IDR"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
        <button
          onClick={save}
          disabled={busy || !code || !name || countryCode.length !== 2 || currency.length !== 3}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create
        </button>
      </div>
    </div>
  )
}

function UnassignedUsers({
  users,
  costCenters,
  onAssigned,
}: { users: UserRow[]; costCenters: CostCenter[]; onAssigned: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (users.length === 0 || costCenters.length === 0) return null
  const active = costCenters.filter((c) => c.active)

  async function assign(userId: string, costCenterId: string) {
    setBusy(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCenterId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        alert(err?.error ?? "Assign failed")
      } else {
        onAssigned()
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40">
      <header className="border-b border-amber-200/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Unassigned employees ({users.length})</h2>
        <p className="text-xs text-amber-800/80 mt-0.5">
          These employees have no cost center — their reimbursements will use the org base currency.
        </p>
      </header>
      <ul className="divide-y divide-amber-100">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-5 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">{u.name ?? "—"}</p>
              <p className="text-xs text-gray-500">{u.email}</p>
            </div>
            <select
              disabled={busy === u.id}
              defaultValue=""
              onChange={(e) => { if (e.target.value) assign(u.id, e.target.value) }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="" disabled>Assign to…</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  )
}
