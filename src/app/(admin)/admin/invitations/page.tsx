"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Upload, Plus, Copy, RefreshCw, Clock, CheckCircle, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface Invitation {
  id: string
  email: string
  phone: string | null
  role: string
  status: "PENDING" | "ACCEPTED" | "EXPIRED"
  sentAt: string
  expiresAt: string
  acceptedAt: string | null
  token: string
  invitedBy: { name: string | null; email: string | null }
  organization: { name: string } | null
}

interface Org { id: string; name: string }

const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const
type Role = typeof ROLES[number]

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  PENDING: { label: "Pending", classes: "bg-yellow-100 text-yellow-700" },
  ACCEPTED: { label: "Accepted", classes: "bg-green-100 text-green-700" },
  EXPIRED: { label: "Expired", classes: "bg-gray-100 text-gray-500" },
}

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

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")

  // Bulk invite dialog
  const [bulkOpen, setBulkOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [parsed, setParsed] = useState<{ email: string; role: Role; phone?: string }[]>([])
  const [selectedOrg, setSelectedOrg] = useState("")
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<{ email: string; status: string; link?: string }[]>([])

  // Single invite dialog
  const [singleOpen, setSingleOpen] = useState(false)
  const [singleForm, setSingleForm] = useState({ email: "", role: "EMPLOYEE" as Role, phone: "", orgId: "" })
  const [sendingSingle, setSendingSingle] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [invRes, orgRes] = await Promise.all([fetch("/api/admin/invitations"), fetch("/api/admin/organizations")])
    if (invRes.ok) setInvitations(await invRes.json())
    if (orgRes.ok) setOrgs(await orgRes.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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

  async function handleBulkSend() {
    if (parsed.length === 0) { toast.error("No valid rows to send"); return }
    setSending(true)
    setResults([])
    const res = await fetch("/api/admin/invitations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: parsed, orgId: selectedOrg || undefined }),
    })
    const data = await res.json()
    setSending(false)
    if (res.ok) {
      setResults(data.results)
      const sent = data.results.filter((r: { status: string }) => r.status === "invited").length
      toast.success(`${sent} invitation${sent !== 1 ? "s" : ""} sent`)
      await fetchAll()
    } else {
      toast.error(data.error ?? "Failed to send invitations")
    }
  }

  async function handleSingleSend() {
    setSendingSingle(true)
    const res = await fetch("/api/admin/invitations/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invites: [{ email: singleForm.email, role: singleForm.role, phone: singleForm.phone || undefined }],
        orgId: singleForm.orgId || undefined,
      }),
    })
    const data = await res.json()
    setSendingSingle(false)
    if (res.ok) {
      const result = data.results[0]
      if (result.status === "invited") {
        toast.success(`Invitation sent to ${singleForm.email}`)
        setSingleOpen(false)
        setSingleForm({ email: "", role: "EMPLOYEE", phone: "", orgId: "" })
      } else {
        toast.error(result.reason ?? "Could not send invitation")
      }
      await fetchAll()
    } else {
      toast.error(data.error ?? "Failed")
    }
  }

  function copyLink(token: string) {
    const link = `${window.location.origin}/register/${token}`
    navigator.clipboard.writeText(link)
    toast.success("Registration link copied!")
  }

  const filtered = invitations.filter((i) => !statusFilter || i.status === statusFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invitations</h1>
          <p className="text-sm text-gray-500 mt-1">Send and track user registration invites</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSingleOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Invite User
          </Button>
          <Button size="sm" onClick={() => { setBulkOpen(true); setResults([]) }}>
            <Upload className="h-4 w-4 mr-1" /> Bulk Upload
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2">
        {["", "PENDING", "ACCEPTED", "EXPIRED"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s === "" ? "All" : STATUS_BADGE[s].label}
          </button>
        ))}
        <button onClick={fetchAll} className="ml-auto text-gray-400 hover:text-gray-600">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading invitations...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-hidden rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Organization</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Sent</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Expires</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((inv) => {
                    const badge = STATUS_BADGE[inv.status]
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{inv.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{inv.role}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{inv.organization?.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badge.classes}`}>
                            {inv.status === "ACCEPTED" && <CheckCircle className="h-3 w-3" />}
                            {inv.status === "PENDING" && <Clock className="h-3 w-3" />}
                            {inv.status === "EXPIRED" && <XCircle className="h-3 w-3" />}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inv.sentAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inv.expiresAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          {inv.status === "PENDING" && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => copyLink(inv.token)}>
                              <Copy className="h-3 w-3 mr-1" /> Copy Link
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No invitations found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Bulk Invite Users</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
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

            {orgs.length > 0 && (
              <div className="space-y-1">
                <Label>Assign to Organization (optional)</Label>
                <select
                  value={selectedOrg}
                  onChange={(e) => setSelectedOrg(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">No organization</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
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

      {/* Single Invite Dialog */}
      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={singleForm.email} onChange={(e) => setSingleForm((p) => ({ ...p, email: e.target.value }))} placeholder="user@company.com" />
            </div>
            <div className="space-y-1">
              <Label>Phone (optional)</Label>
              <Input value={singleForm.phone} onChange={(e) => setSingleForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+628123456789" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select value={singleForm.role} onChange={(e) => setSingleForm((p) => ({ ...p, role: e.target.value as Role }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {orgs.length > 0 && (
              <div className="space-y-1">
                <Label>Organization</Label>
                <select value={singleForm.orgId} onChange={(e) => setSingleForm((p) => ({ ...p, orgId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">No organization</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleOpen(false)}>Cancel</Button>
            <Button onClick={handleSingleSend} disabled={sendingSingle || !singleForm.email}>{sendingSingle ? "Sending..." : "Send Invitation"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
