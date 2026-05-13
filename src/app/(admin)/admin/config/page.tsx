"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ChevronUp, ChevronDown, X } from "lucide-react"
import { derivePreviewSteps } from "@/lib/workflow-preview-helpers"

// Types
interface CostCenter {
  id: string
  name: string
  code: string
}

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

function WorkflowPreviewCard({
  selectedCC,
  committee,
  users,
  financeOfficerId,
}: {
  selectedCC: CostCenter | null
  committee: ApprovalCommittee
  users: UserOption[]
  financeOfficerId: string | null
}) {
  const fo = users.find((u) => u.id === financeOfficerId)
  const steps = derivePreviewSteps(committee)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approval Flow Preview</CardTitle>
        <p className="text-xs text-gray-500">
          How requests from{" "}
          <span className="font-semibold">{selectedCC?.name ?? "this cost center"}</span> will be
          routed
        </p>
      </CardHeader>
      <CardContent>
        {steps.length === 0 ? (
          <p className="text-sm text-amber-600">
            No approvers configured — requests will not route.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium">
                Employee
              </span>
              <span className="text-gray-400">→</span>
              {committee.mode === "sequential" ? (
                steps.map((step, idx) => {
                  const u = users.find((u) => u.id === step.id)
                  return (
                    <>
                      <span
                        key={step.id}
                        className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                      >
                        {u?.name ?? u?.email ?? "Unknown"} (Step {idx + 1})
                      </span>
                      {idx < steps.length - 1 && (
                        <span className="text-gray-400">→</span>
                      )}
                    </>
                  )
                })
              ) : (
                <div className="flex gap-2 flex-wrap items-center">
                  {steps.map((step) => {
                    const u = users.find((u) => u.id === step.id)
                    return (
                      <span
                        key={step.id}
                        className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-800"
                      >
                        {u?.name ?? u?.email ?? "Unknown"} (parallel)
                      </span>
                    )
                  })}
                </div>
              )}
              <span className="text-gray-400">→</span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                {fo ? (fo.name ?? fo.email) : "Finance Officer (not set)"}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Mode:{" "}
              {committee.mode === "sequential"
                ? "Sequential — each approver acts in order"
                : "Parallel — all approvers notified simultaneously; all must approve"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RoleAssignmentsCard({
  users,
  onChanged,
}: {
  users: UserOption[]
  onChanged: () => void
}) {
  const [savingId, setSavingId] = useState<string | null>(null)

  async function handleRoleChange(userId: string, newRole: string) {
    setSavingId(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        toast.success("Role updated")
        onChanged()
      } else {
        toast.error("Failed to update role")
      }
    } finally {
      setSavingId(null)
    }
  }

  const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Role Assignments</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-600">User</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Current Role</th>
                <th className="px-4 py-2 text-left font-medium text-gray-600">Change To</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{u.name ?? "—"}</div>
                    <div className="text-xs text-gray-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {ROLES.filter((r) => r !== u.role).map((r) => (
                        <Button
                          key={r}
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          disabled={savingId === u.id}
                          onClick={() => handleRoleChange(u.id, r)}
                        >
                          → {r}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminConfigPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserOption[]>([])
  const [meta, setMeta] = useState<Record<string, ConfigMeta>>({})

  // Cost center selection
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)

  // Approval Committee
  const [committee, setCommittee] = useState<ApprovalCommittee>({
    mode: "sequential",
    approvers: [],
  })
  const [committeeAddId, setCommitteeAddId] = useState("")
  const [savingCommittee, setSavingCommittee] = useState(false)

  // Finance Officer
  const [financeOfficerId, setFinanceOfficerId] = useState<string | null>(null)
  const [savingFO, setSavingFO] = useState(false)

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

  // Load cost centers on mount
  useEffect(() => {
    fetch("/api/admin/cost-centers")
      .then((r) => r.ok ? r.json() : { costCenters: [] })
      .then((data: { costCenters: CostCenter[] }) => {
        setCostCenters(data.costCenters ?? [])
      })
      .catch(() => {
        toast.error("Failed to load cost centers")
      })
  }, [])

  const loadData = useCallback(async (ccId: string | null) => {
    setLoading(true)
    try {
      const ccParam = ccId ? `&costCenterId=${ccId}` : ""
      const [configRes, usersRes] = await Promise.all([
        fetch(`/api/admin/config?_=${Date.now()}${ccParam}`),
        fetch("/api/admin/users"),
      ])

      if (configRes.ok) {
        const data: ConfigData = await configRes.json()
        setMeta(data.meta ?? {})
        const c = data.configs

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
        } else {
          setCommittee({ mode: "sequential", approvers: [] })
        }

        if (c.financeOfficer) {
          const fo = c.financeOfficer as { userId?: string }
          setFinanceOfficerId(fo.userId ?? null)
        } else {
          setFinanceOfficerId(null)
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
  }, [])

  useEffect(() => {
    loadData(selectedCC?.id ?? null)
  }, [loadData, selectedCC?.id])

  async function saveConfig(key: string, value: unknown, costCenterId: string | null): Promise<boolean> {
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, costCenterId }),
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
    const ok = await saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)
    if (ok) toast.success("Approval committee saved")
    else toast.error("Failed to save approval committee")
    setSavingCommittee(false)
  }

  async function handleSaveFO() {
    setSavingFO(true)
    const value = financeOfficerId ? { userId: financeOfficerId } : null
    const ok = await saveConfig("financeOfficer", value, selectedCC?.id ?? null)
    if (ok) toast.success("Finance Officer saved")
    else toast.error("Failed to save Finance Officer")
    setSavingFO(false)
  }

  async function handleSaveDeadlines() {
    setSavingDeadlines(true)
    const [ok1, ok2] = await Promise.all([
      saveConfig("submissionDeadline", submissionDeadline, selectedCC?.id ?? null),
      saveConfig("approvalDeadline", approvalDeadline, selectedCC?.id ?? null),
    ])
    if (ok1 && ok2) toast.success("Deadlines saved")
    else toast.error("Failed to save deadlines")
    setSavingDeadlines(false)
  }

  async function handleSaveMaxAmounts() {
    setSavingMaxAmounts(true)
    const ok = await saveConfig("maxAmountPerCategory", maxAmounts, selectedCC?.id ?? null)
    if (ok) toast.success("Category limits saved")
    else toast.error("Failed to save category limits")
    setSavingMaxAmounts(false)
  }

  async function handleSaveReceipt() {
    setSavingReceipt(true)
    const ok = await saveConfig("requireReceiptAbove", requireReceiptAbove, selectedCC?.id ?? null)
    if (ok) toast.success("Receipt threshold saved")
    else toast.error("Failed to save receipt threshold")
    setSavingReceipt(false)
  }

  async function handleSaveCategories() {
    setSavingCategories(true)
    const ok = await saveConfig("allowedCategories", allowedCategories, selectedCC?.id ?? null)
    if (ok) toast.success("Allowed categories saved")
    else toast.error("Failed to save allowed categories")
    setSavingCategories(false)
  }

  async function handleSaveNotif() {
    setSavingNotif(true)
    const ok = await saveConfig("notificationChannels", notifChannels, selectedCC?.id ?? null)
    if (ok) toast.success("Notification channels saved")
    else toast.error("Failed to save notification channels")
    setSavingNotif(false)
  }

  async function handleSaveResubmit() {
    setSavingResubmit(true)
    const ok = await saveConfig("resubmitBehavior", resubmitBehavior, selectedCC?.id ?? null)
    if (ok) toast.success("Resubmit behavior saved")
    else toast.error("Failed to save resubmit behavior")
    setSavingResubmit(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading configuration...</div>
  }

  const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"] as const

  const financeUsers = users.filter((u) => u.role === "FINANCE")

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">System Configuration</h1>

      {/* Cost Center Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Center Scope</CardTitle>
          <p className="text-xs text-gray-500">
            Select a cost center to view and edit its specific configuration. Leave unselected for
            org-wide defaults.
          </p>
        </CardHeader>
        <CardContent>
          <select
            value={selectedCC?.id ?? ""}
            onChange={(e) => {
              const cc = costCenters.find((c) => c.id === e.target.value) ?? null
              setSelectedCC(cc)
            }}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Org-wide defaults</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.name} ({cc.code})
              </option>
            ))}
          </select>
          {selectedCC && (
            <p className="text-xs text-blue-600 mt-2">
              Editing configuration for: <span className="font-semibold">{selectedCC.name}</span>
            </p>
          )}
        </CardContent>
      </Card>

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

      {/* Finance Officer for This Cost Center */}
      <SectionCard
        title="Finance Officer for This Cost Center"
        metaKey="financeOfficer"
        meta={meta}
        onSave={handleSaveFO}
        saving={savingFO}
      >
        <p className="text-sm text-gray-600">
          This officer handles payment for approved requests in{" "}
          <span className="font-medium">{selectedCC?.name ?? "this cost center"}</span>.
        </p>
        {financeUsers.length === 0 ? (
          <p className="text-sm text-amber-600">
            No Finance Officers available. Promote an employee below.
          </p>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="financeOfficer">Finance Officer</Label>
            <select
              id="financeOfficer"
              value={financeOfficerId ?? ""}
              onChange={(e) => setFinanceOfficerId(e.target.value || null)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">None assigned</option>
              {financeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </SectionCard>

      {/* Workflow Preview Card */}
      <WorkflowPreviewCard
        selectedCC={selectedCC}
        committee={committee}
        users={users}
        financeOfficerId={financeOfficerId}
      />

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

      {/* 8. Role Assignments (org-wide) */}
      <p className="text-xs text-gray-500 mb-2">
        Role promotions apply org-wide — not scoped to the selected cost center.
      </p>
      <RoleAssignmentsCard users={users} onChanged={() => loadData(selectedCC?.id ?? null)} />
    </div>
  )
}
