"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ChevronUp, ChevronDown, X, Globe2, Building2 } from "lucide-react"

// Types
interface UserOption {
  id: string
  name: string | null
  email: string | null
  role: string
}

interface ApprovalCommittee {
  mode: "sequential" | "parallel"
  approvers: string[]
}

interface NotificationChannels {
  email: boolean
  whatsapp: boolean
  inApp: boolean
}

interface ConfigMeta {
  updatedAt: string
  updatedBy: { id: string; name: string | null } | null
}

interface ConfigData {
  configs: Record<string, unknown>
  meta: Record<string, ConfigMeta>
}

function MetaInfo({ meta }: { meta?: ConfigMeta }) {
  if (!meta) return null
  const name = meta.updatedBy?.name ?? "Unknown"
  const time = new Date(meta.updatedAt).toLocaleString()
  return (
    <p className="text-xs text-gray-500 mt-1">
      Last updated by {name} at {time}
    </p>
  )
}

function SectionCard({
  title,
  metaKey,
  meta,
  onSave,
  saving,
  children,
}: {
  title: string
  metaKey: string
  meta: Record<string, ConfigMeta>
  onSave: () => void
  saving: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <MetaInfo meta={meta[metaKey]} />
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <Button onClick={onSave} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}

const GLOBAL_SCOPE = "__global__"

export default function AdminConfigPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserOption[]>([])
  const [meta, setMeta] = useState<Record<string, ConfigMeta>>({})
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [scopeOrgId, setScopeOrgId] = useState<string>(GLOBAL_SCOPE)

  // Approval Committee
  const [committee, setCommittee] = useState<ApprovalCommittee>({
    mode: "sequential",
    approvers: [],
  })
  const [committeeAddId, setCommitteeAddId] = useState("")
  const [savingCommittee, setSavingCommittee] = useState(false)

  // Deadlines
  const [submissionDeadline, setSubmissionDeadline] = useState(25)
  const [approvalDeadline, setApprovalDeadline] = useState(5)
  const [savingDeadlines, setSavingDeadlines] = useState(false)

  // Max amounts per category
  const [maxAmounts, setMaxAmounts] = useState<Record<string, number>>({
    TRAVEL: 5000,
    MEALS: 500,
    SUPPLIES: 1000,
    OTHER: 2000,
  })
  const [savingMaxAmounts, setSavingMaxAmounts] = useState(false)

  // Require receipt above
  const [requireReceiptAbove, setRequireReceiptAbove] = useState(50)
  const [savingReceipt, setSavingReceipt] = useState(false)

  // Allowed categories
  const [allowedCategories, setAllowedCategories] = useState<string[]>(["TRAVEL", "MEALS", "SUPPLIES", "OTHER"])
  const [savingCategories, setSavingCategories] = useState(false)

  // Notification channels
  const [notifChannels, setNotifChannels] = useState<NotificationChannels>({
    email: true,
    whatsapp: false,
    inApp: true,
  })
  const [savingNotif, setSavingNotif] = useState(false)

  // Resubmit behavior
  const [resubmitBehavior, setResubmitBehavior] = useState<"reset" | "continue">("reset")
  const [savingResubmit, setSavingResubmit] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const scopeParam = scopeOrgId === GLOBAL_SCOPE ? "global" : scopeOrgId
      const [configRes, usersRes, orgsRes] = await Promise.all([
        fetch(`/api/admin/config?organizationId=${encodeURIComponent(scopeParam)}`),
        fetch("/api/admin/users"),
        fetch("/api/admin/organizations"),
      ])
      if (orgsRes.ok) setOrgs(await orgsRes.json())

      if (configRes.ok) {
        const data: ConfigData = await configRes.json()
        setMeta(data.meta ?? {})
        const c = data.configs

        // Reset to defaults before applying new scope's values
        setCommittee({ mode: "sequential", approvers: [] })
        setSubmissionDeadline(25)
        setApprovalDeadline(5)
        setMaxAmounts({ TRAVEL: 5000, MEALS: 500, SUPPLIES: 1000, OTHER: 2000 })
        setRequireReceiptAbove(50)
        setAllowedCategories(["TRAVEL", "MEALS", "SUPPLIES", "OTHER"])
        setNotifChannels({ email: true, whatsapp: false, inApp: true })
        setResubmitBehavior("reset")

        if (c.approvalCommittee) {
          const raw = c.approvalCommittee as Record<string, unknown>
          const approvers = Array.isArray(raw.approvers)
            ? (raw.approvers as string[])
            : Array.isArray((raw as Record<string, unknown>).members)
              ? ((raw as Record<string, unknown>).members as { userId: string }[]).map((m) => m.userId)
              : []
          setCommittee({
            mode: (raw.mode as "sequential" | "parallel") ?? "sequential",
            approvers,
          })
        }
        if (typeof c.submissionDeadline === "number") {
          setSubmissionDeadline(c.submissionDeadline)
        }
        if (typeof c.approvalDeadline === "number") {
          setApprovalDeadline(c.approvalDeadline)
        }
        if (c.maxAmountPerCategory) {
          setMaxAmounts(c.maxAmountPerCategory as Record<string, number>)
        }
        if (typeof c.requireReceiptAbove === "number") {
          setRequireReceiptAbove(c.requireReceiptAbove)
        }
        if (Array.isArray(c.allowedCategories)) {
          setAllowedCategories(c.allowedCategories as string[])
        }
        if (c.notificationChannels) {
          setNotifChannels(c.notificationChannels as NotificationChannels)
        }
        if (c.resubmitBehavior) {
          setResubmitBehavior(c.resubmitBehavior as "reset" | "continue")
        }
      }

      if (usersRes.ok) {
        const usersData: UserOption[] = await usersRes.json()
        setUsers(usersData)
      }
    } catch {
      toast.error("Failed to load configuration")
    } finally {
      setLoading(false)
    }
  }, [scopeOrgId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function saveConfig(key: string, value: unknown): Promise<boolean> {
    const organizationId = scopeOrgId === GLOBAL_SCOPE ? null : scopeOrgId
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, organizationId }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.config?.updatedAt) {
        setMeta((prev) => ({
          ...prev,
          [key]: {
            updatedAt: data.config.updatedAt,
            updatedBy: data.config.updatedBy ?? null,
          },
        }))
      }
      return true
    }
    return false
  }

  // Approval committee helpers
  const approverOptions = users.filter(
    (u) => (u.role === "APPROVER" || u.role === "ADMIN") && !committee.approvers.includes(u.id)
  )

  function moveApprover(index: number, direction: "up" | "down") {
    const newApprovers = [...committee.approvers]
    const swapIdx = direction === "up" ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newApprovers.length) return
    ;[newApprovers[index], newApprovers[swapIdx]] = [newApprovers[swapIdx], newApprovers[index]]
    setCommittee((prev) => ({ ...prev, approvers: newApprovers }))
  }

  function removeApprover(id: string) {
    setCommittee((prev) => ({ ...prev, approvers: prev.approvers.filter((a) => a !== id) }))
  }

  function addApprover() {
    if (!committeeAddId) return
    setCommittee((prev) => ({ ...prev, approvers: [...prev.approvers, committeeAddId] }))
    setCommitteeAddId("")
  }

  async function handleSaveCommittee() {
    setSavingCommittee(true)
    const ok = await saveConfig("approvalCommittee", committee)
    if (ok) toast.success("Approval committee saved")
    else toast.error("Failed to save approval committee")
    setSavingCommittee(false)
  }

  async function handleSaveDeadlines() {
    setSavingDeadlines(true)
    const [ok1, ok2] = await Promise.all([
      saveConfig("submissionDeadline", submissionDeadline),
      saveConfig("approvalDeadline", approvalDeadline),
    ])
    if (ok1 && ok2) toast.success("Deadlines saved")
    else toast.error("Failed to save deadlines")
    setSavingDeadlines(false)
  }

  async function handleSaveMaxAmounts() {
    setSavingMaxAmounts(true)
    const ok = await saveConfig("maxAmountPerCategory", maxAmounts)
    if (ok) toast.success("Category limits saved")
    else toast.error("Failed to save category limits")
    setSavingMaxAmounts(false)
  }

  async function handleSaveReceipt() {
    setSavingReceipt(true)
    const ok = await saveConfig("requireReceiptAbove", requireReceiptAbove)
    if (ok) toast.success("Receipt threshold saved")
    else toast.error("Failed to save receipt threshold")
    setSavingReceipt(false)
  }

  async function handleSaveCategories() {
    setSavingCategories(true)
    const ok = await saveConfig("allowedCategories", allowedCategories)
    if (ok) toast.success("Allowed categories saved")
    else toast.error("Failed to save allowed categories")
    setSavingCategories(false)
  }

  async function handleSaveNotif() {
    setSavingNotif(true)
    const ok = await saveConfig("notificationChannels", notifChannels)
    if (ok) toast.success("Notification channels saved")
    else toast.error("Failed to save notification channels")
    setSavingNotif(false)
  }

  async function handleSaveResubmit() {
    setSavingResubmit(true)
    const ok = await saveConfig("resubmitBehavior", resubmitBehavior)
    if (ok) toast.success("Resubmit behavior saved")
    else toast.error("Failed to save resubmit behavior")
    setSavingResubmit(false)
  }

  const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"] as const
  const isGlobal = scopeOrgId === GLOBAL_SCOPE
  const currentOrgName = isGlobal ? "Global defaults" : (orgs.find((o) => o.id === scopeOrgId)?.name ?? "Organization")

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">System Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configuring:{" "}
            <span className="font-medium text-gray-900">{currentOrgName}</span>
            {!isGlobal && <span className="text-xs text-gray-400 ml-2">(falls back to global for unset keys)</span>}
          </p>
        </div>
      </div>

      {/* Scope selector */}
      <Card>
        <CardContent className="p-4">
          <Label className="text-xs uppercase tracking-wide text-gray-500">Scope</Label>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setScopeOrgId(GLOBAL_SCOPE)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                isGlobal ? "bg-[#0B1E3F] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              Global defaults
            </button>
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setScopeOrgId(o.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                  scopeOrgId === o.id ? "bg-cyan-500 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Building2 className="h-3.5 w-3.5" />
                {o.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-center py-6 text-gray-500 text-sm">Loading configuration...</div>}
      {!loading && (<>


      {/* 1. Approval Committee */}
      <SectionCard
        title="Approval Committee"
        metaKey="approvalCommittee"
        meta={meta}
        onSave={handleSaveCommittee}
        saving={savingCommittee}
      >
        <div className="space-y-2">
          <Label>Approval Mode</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="sequential"
                checked={committee.mode === "sequential"}
                onChange={() => setCommittee((p) => ({ ...p, mode: "sequential" }))}
              />
              Sequential
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="parallel"
                checked={committee.mode === "parallel"}
                onChange={() => setCommittee((p) => ({ ...p, mode: "parallel" }))}
              />
              Parallel
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Approvers (in order)</Label>
          {committee.approvers.length === 0 && (
            <p className="text-sm text-gray-500">No approvers configured.</p>
          )}
          <div className="space-y-1">
            {committee.approvers.map((approverId, idx) => {
              const user = users.find((u) => u.id === approverId)
              return (
                <div key={approverId} className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2">
                  <span className="text-xs text-gray-400 w-5">{idx + 1}.</span>
                  <span className="flex-1 text-sm">
                    {user?.name ?? approverId}{" "}
                    <span className="text-gray-400 text-xs">({user?.email ?? ""})</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => moveApprover(idx, "up")}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => moveApprover(idx, "down")}
                    disabled={idx === committee.approvers.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    onClick={() => removeApprover(approverId)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            })}
          </div>

          <div className="flex gap-2 mt-2">
            <select
              value={committeeAddId}
              onChange={(e) => setCommitteeAddId(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select approver to add...</option>
              {approverOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email} ({u.role})
                </option>
              ))}
            </select>
            <Button onClick={addApprover} disabled={!committeeAddId} size="sm" variant="outline">
              Add
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* 2. Deadlines */}
      <SectionCard
        title="Deadlines"
        metaKey="submissionDeadline"
        meta={meta}
        onSave={handleSaveDeadlines}
        saving={savingDeadlines}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="submissionDeadline">Submission Deadline (day of month)</Label>
            <Input
              id="submissionDeadline"
              type="number"
              min={1}
              max={31}
              value={submissionDeadline}
              onChange={(e) => setSubmissionDeadline(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="approvalDeadline">Approval SLA (business days)</Label>
            <Input
              id="approvalDeadline"
              type="number"
              min={1}
              value={approvalDeadline}
              onChange={(e) => setApprovalDeadline(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </SectionCard>

      {/* 3. Category Rules */}
      <SectionCard
        title="Category Rules"
        metaKey="maxAmountPerCategory"
        meta={meta}
        onSave={handleSaveMaxAmounts}
        saving={savingMaxAmounts}
      >
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Category</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Max Amount (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {CATEGORIES.map((cat) => (
                <tr key={cat}>
                  <td className="px-4 py-2 capitalize font-medium">
                    {cat.charAt(0) + cat.slice(1).toLowerCase()}
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={0}
                      value={maxAmounts[cat] ?? 0}
                      onChange={(e) =>
                        setMaxAmounts((prev) => ({ ...prev, [cat]: Number(e.target.value) }))
                      }
                      className="w-36 h-7 text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 4. Receipt threshold */}
      <SectionCard
        title="Receipt Requirement"
        metaKey="requireReceiptAbove"
        meta={meta}
        onSave={handleSaveReceipt}
        saving={savingReceipt}
      >
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="requireReceiptAbove">Require receipt for amounts above (USD)</Label>
          <Input
            id="requireReceiptAbove"
            type="number"
            min={0}
            value={requireReceiptAbove}
            onChange={(e) => setRequireReceiptAbove(Number(e.target.value))}
          />
        </div>
      </SectionCard>

      {/* 5. Allowed Categories */}
      <SectionCard
        title="Allowed Categories"
        metaKey="allowedCategories"
        meta={meta}
        onSave={handleSaveCategories}
        saving={savingCategories}
      >
        <div className="flex flex-wrap gap-4">
          {CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowedCategories.includes(cat)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setAllowedCategories((prev) => [...prev, cat])
                  } else {
                    setAllowedCategories((prev) => prev.filter((c) => c !== cat))
                  }
                }}
              />
              <span className="text-sm capitalize">{cat.charAt(0) + cat.slice(1).toLowerCase()}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      {/* 6. Notification Channels */}
      <SectionCard
        title="Notification Channels"
        metaKey="notificationChannels"
        meta={meta}
        onSave={handleSaveNotif}
        saving={savingNotif}
      >
        <div className="flex flex-wrap gap-6">
          {(
            [
              { key: "email", label: "Email" },
              { key: "whatsapp", label: "WhatsApp" },
              { key: "inApp", label: "In-App" },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifChannels[key]}
                onChange={(e) =>
                  setNotifChannels((prev) => ({ ...prev, [key]: e.target.checked }))
                }
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      {/* 7. Resubmit Behavior */}
      <SectionCard
        title="Resubmit Behavior"
        metaKey="resubmitBehavior"
        meta={meta}
        onSave={handleSaveResubmit}
        saving={savingResubmit}
      >
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="reset"
              checked={resubmitBehavior === "reset"}
              onChange={() => setResubmitBehavior("reset")}
            />
            Reset to beginning
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="continue"
              checked={resubmitBehavior === "continue"}
              onChange={() => setResubmitBehavior("continue")}
            />
            Continue from current step
          </label>
        </div>
      </SectionCard>
      </>)}
    </div>
  )
}
