"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ChevronUp, ChevronDown, X, UserPlus, ShieldCheck, Banknote, Building2, Loader2, Plus, Trash2, RotateCcw, CheckCircle2 } from "lucide-react"
import { CostCenterSelector, type CostCenter } from "@/components/admin/CostCenterSelector"
import { derivePreviewSteps } from "@/lib/workflow-preview-helpers"
import type { CustomCategory } from "@/lib/custom-categories"

type PerDiemRate = { standard: number; highCost?: number; highCostCities?: string[] }
type PerDiemRateTable = Record<string, PerDiemRate>

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
                    <React.Fragment key={step.id}>
                      <span
                        className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                      >
                        {u?.name ?? u?.email ?? "Unknown"} (Step {idx + 1})
                      </span>
                      {idx < steps.length - 1 && (
                        <span className="text-gray-400">→</span>
                      )}
                    </React.Fragment>
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
  const [busy, setBusy] = useState<string | null>(null)
  const [addApprover, setAddApprover] = useState("")
  const [addFinance, setAddFinance] = useState("")

  const approvers = users.filter((u) => u.role === "APPROVER")
  const financeUsers = users.filter((u) => u.role === "FINANCE")
  const employees = users.filter((u) => u.role === "EMPLOYEE")

  async function changeRole(userId: string, role: string) {
    setBusy(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        toast.success("Role updated")
        onChanged()
      } else {
        const err = await res.json().catch(() => null)
        toast.error(err?.error ?? "Failed to update role")
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Role Assignments</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">
          Assign which employees act as approvers or finance officers. All other role management is
          handled within{" "}
          <a href="/admin/cost-centers" className="underline text-blue-600">Cost Centers</a>.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {/* Approvers */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-800">Approvers</span>
          </div>
          {approvers.length === 0 ? (
            <p className="text-xs text-gray-400">No approvers assigned.</p>
          ) : (
            <ul className="space-y-1">
              {approvers.map((u) => (
                <li key={u.id} className="flex items-center justify-between rounded-md bg-blue-50 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-gray-800">{u.name ?? "—"}</p>
                    <p className="text-[11px] text-gray-500">{u.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    disabled={busy === u.id}
                    onClick={() => changeRole(u.id, "EMPLOYEE")}
                    title="Remove approver role"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <select
              value={addApprover}
              onChange={(e) => setAddApprover(e.target.value)}
              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
            >
              <option value="">Promote employee to approver…</option>
              {employees.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!addApprover || !!busy}
              onClick={() => { changeRole(addApprover, "APPROVER"); setAddApprover("") }}
            >
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Finance Officers */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-gray-800">Finance Officers</span>
          </div>
          {financeUsers.length === 0 ? (
            <p className="text-xs text-gray-400">No finance officers assigned.</p>
          ) : (
            <ul className="space-y-1">
              {financeUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between rounded-md bg-green-50 px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-gray-800">{u.name ?? "—"}</p>
                    <p className="text-[11px] text-gray-500">{u.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    disabled={busy === u.id}
                    onClick={() => changeRole(u.id, "EMPLOYEE")}
                    title="Remove finance role"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <select
              value={addFinance}
              onChange={(e) => setAddFinance(e.target.value)}
              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm"
            >
              <option value="">Promote employee to finance…</option>
              {employees.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!addFinance || !!busy}
              onClick={() => { changeRole(addFinance, "FINANCE"); setAddFinance("") }}
            >
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const CATEGORIES = ["TRAVEL", "MEALS", "SUPPLIES", "ACCOMMODATION", "COMMUNICATION", "TRAINING", "ENTERTAINMENT", "MEETING", "EQUIPMENT", "PRINTING", "SOFTWARE", "OTHER"] as const

function AddCustomCategoryRow({
  existingCodes,
  onAdd,
}: {
  existingCodes: readonly string[]
  onAdd: (cat: CustomCategory) => void
}) {
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)

  function handleAdd() {
    const trimmedName = name.trim()
    const trimmedCode = code.trim().toUpperCase()
    if (!trimmedName) { setError("Name is required"); return }
    if (!trimmedCode || !/^[A-Z0-9_]+$/.test(trimmedCode)) {
      setError("Code must be uppercase letters, digits, and underscores only")
      return
    }
    if (trimmedCode.length > 30) { setError("Code too long (max 30 chars)"); return }
    if (existingCodes.includes(trimmedCode)) {
      setError(`Code "${trimmedCode}" already exists`)
      return
    }
    setError(null)
    onAdd({ name: trimmedName, code: trimmedCode, enabled: true })
    setName("")
    setCode("")
  }

  return (
    <div className="space-y-1 pt-2 border-t">
      <div className="flex gap-2">
        <Input
          placeholder="Name (e.g. Conference Fees)"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          maxLength={60}
          className="flex-1 h-8 text-sm"
        />
        <Input
          placeholder="Code (e.g. CONF_FEES)"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null) }}
          maxLength={30}
          className="w-36 h-8 text-sm font-mono"
        />
        <Button size="sm" variant="outline" className="h-8" onClick={handleAdd}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export default function AdminConfigPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserOption[]>([])
  const [meta, setMeta] = useState<Record<string, ConfigMeta>>({})

  // Cost center state
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [selectedCC, setSelectedCC] = useState<CostCenter | null>(null)
  const [loadingCCs, setLoadingCCs] = useState(true)

  // Approval Committee
  const [committee, setCommittee] = useState<ApprovalCommittee>({
    mode: "sequential",
    approvers: [],
  })
  const [committeeAddId, setCommitteeAddId] = useState("")
  const [savingCommittee, setSavingCommittee] = useState(false)
  const [committeeError, setCommitteeError] = useState<string | null>(null)

  // Finance Officer
  const [financeOfficerId, setFinanceOfficerId] = useState<string | null>(null)
  const [savingFO, setSavingFO] = useState(false)

  // Deadlines
  const [submissionDeadline, setSubmissionDeadline] = useState(25)
  const [approvalDeadline, setApprovalDeadline] = useState(5)
  const [paymentDeadline, setPaymentDeadline] = useState(5)
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

  // Overall request limit & auto-approve threshold
  const [maxAmountPerRequest, setMaxAmountPerRequest] = useState<number>(0)
  const [approvalThreshold, setApprovalThreshold] = useState<number>(0)
  const [savingLimits, setSavingLimits] = useState(false)

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

  // Custom Categories
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [savingCustomCategories, setSavingCustomCategories] = useState(false)

  // Dirty tracking
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const savedRef = useRef<Record<string, unknown>>({})
  const isDirty = dirtyKeys.size > 0

  function markDirty(key: string) {
    setDirtyKeys(prev => new Set(prev).add(key))
  }

  function markClean(...keys: string[]) {
    setDirtyKeys(prev => {
      const next = new Set(prev)
      keys.forEach(k => next.delete(k))
      return next
    })
  }

  // Load cost centers once on mount
  useEffect(() => {
    async function loadCostCenters() {
      setLoadingCCs(true)
      try {
        const res = await fetch("/api/admin/cost-centers")
        const data = await res.json()
        const centers = (Array.isArray(data) ? data : data.costCenters) || []
        setCostCenters(centers)
        if (centers.length > 0) {
          setSelectedCC(centers[0]) // auto-select first CC
        }
      } finally {
        setLoadingCCs(false)
      }
    }
    loadCostCenters()
  }, []) // empty deps — runs once

  const loadData = useCallback(async (ccId: string | null) => {
    setLoading(true)
    try {
      const [configRes, usersRes] = await Promise.all([
        fetch(`/api/admin/config${ccId ? `?costCenterId=${ccId}` : ""}`),
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

        setSubmissionDeadline(typeof c.submissionDeadline === "number" ? c.submissionDeadline : 25)
        setApprovalDeadline(typeof c.approvalDeadline === "number" ? c.approvalDeadline : 5)
        setPaymentDeadline(typeof c.paymentDeadline === "number" ? c.paymentDeadline : 5)
        setMaxAmounts(
          c.maxAmountPerCategory
            ? (c.maxAmountPerCategory as Record<string, number>)
            : { TRAVEL: 5000, MEALS: 500, SUPPLIES: 1000, OTHER: 2000 }
        )
        setRequireReceiptAbove(typeof c.requireReceiptAbove === "number" ? c.requireReceiptAbove : 50)
        setMaxAmountPerRequest(typeof c.maxAmountPerRequest === "number" ? c.maxAmountPerRequest : 0)
        setApprovalThreshold(typeof c.approvalThreshold === "number" ? c.approvalThreshold : 0)
        setAllowedCategories(
          Array.isArray(c.allowedCategories)
            ? (c.allowedCategories as string[])
            : ["TRAVEL", "MEALS", "SUPPLIES", "OTHER"]
        )
        setNotifChannels(
          c.notificationChannels
            ? (c.notificationChannels as NotificationChannels)
            : { email: true, whatsapp: false, inApp: true }
        )
        setResubmitBehavior(
          (c.resubmitBehavior as "reset" | "continue") ?? "reset"
        )
        if (Array.isArray(c.customCategories)) {
          setCustomCategories(c.customCategories as CustomCategory[])
        } else {
          setCustomCategories([])
        }

        // Snapshot the just-loaded values so handleDiscardAll can restore them
        savedRef.current = {
          committee: {
            mode: (c.approvalCommittee as Record<string, unknown>)?.mode ?? "sequential",
            approvers: (() => {
              const raw = c.approvalCommittee as Record<string, unknown> | undefined
              if (!raw) return []
              if (Array.isArray(raw.approvers)) return raw.approvers as string[]
              if (Array.isArray((raw as Record<string, unknown>).members))
                return ((raw as Record<string, unknown>).members as { userId: string }[]).map(m => m.userId)
              return []
            })(),
          },
          financeOfficerId: (c.financeOfficer as { userId?: string })?.userId ?? null,
          submissionDeadline: typeof c.submissionDeadline === "number" ? c.submissionDeadline : 25,
          approvalDeadline: typeof c.approvalDeadline === "number" ? c.approvalDeadline : 5,
          paymentDeadline: typeof c.paymentDeadline === "number" ? c.paymentDeadline : 5,
          maxAmounts: c.maxAmountPerCategory
            ? (c.maxAmountPerCategory as Record<string, number>)
            : { TRAVEL: 5000, MEALS: 500, SUPPLIES: 1000, OTHER: 2000 },
          requireReceiptAbove: typeof c.requireReceiptAbove === "number" ? c.requireReceiptAbove : 50,
          maxAmountPerRequest: typeof c.maxAmountPerRequest === "number" ? c.maxAmountPerRequest : 0,
          approvalThreshold: typeof c.approvalThreshold === "number" ? c.approvalThreshold : 0,
          allowedCategories: Array.isArray(c.allowedCategories) ? c.allowedCategories as string[] : ["TRAVEL", "MEALS", "SUPPLIES", "OTHER"],
          notifChannels: c.notificationChannels
            ? (c.notificationChannels as NotificationChannels)
            : { email: true, whatsapp: false, inApp: true },
          resubmitBehavior: (c.resubmitBehavior as "reset" | "continue") ?? "reset",
          customCategories: Array.isArray(c.customCategories) ? c.customCategories as CustomCategory[] : [],
        }
        // Clear dirty state on CC switch/reload — loadData resets all state
        setDirtyKeys(new Set())
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

  // Re-fetch config whenever selectedCC changes
  useEffect(() => {
    if (selectedCC !== undefined) {
      loadData(selectedCC?.id ?? null)
    }
  }, [selectedCC?.id, loadData])

  // Prevent accidental navigation when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  function handleDiscardAll() {
    const s = savedRef.current
    if (s.committee) setCommittee(s.committee as ApprovalCommittee)
    if (s.financeOfficerId !== undefined) setFinanceOfficerId(s.financeOfficerId as string | null)
    if (typeof s.submissionDeadline === "number") setSubmissionDeadline(s.submissionDeadline)
    if (typeof s.approvalDeadline === "number") setApprovalDeadline(s.approvalDeadline)
    if (typeof s.paymentDeadline === "number") setPaymentDeadline(s.paymentDeadline)
    if (s.maxAmounts) setMaxAmounts(s.maxAmounts as Record<string, number>)
    if (typeof s.requireReceiptAbove === "number") setRequireReceiptAbove(s.requireReceiptAbove)
    if (typeof s.maxAmountPerRequest === "number") setMaxAmountPerRequest(s.maxAmountPerRequest)
    if (typeof s.approvalThreshold === "number") setApprovalThreshold(s.approvalThreshold)
    if (Array.isArray(s.allowedCategories)) setAllowedCategories(s.allowedCategories as string[])
    if (s.notifChannels) setNotifChannels(s.notifChannels as NotificationChannels)
    if (s.resubmitBehavior) setResubmitBehavior(s.resubmitBehavior as "reset" | "continue")
    if (Array.isArray(s.customCategories)) setCustomCategories(s.customCategories as CustomCategory[])
    setDirtyKeys(new Set())
  }

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

  const currency = selectedCC?.currency ?? "USD"

  // Approval committee helpers
  const approverOptions = users.filter(
    (u) => (u.role === "APPROVER" || u.role === "ADMIN") && !committee.approvers.includes(u.id)
  )

  function moveApprover(index: number, direction: "up" | "down") {
    const newApprovers = [...committee.approvers]
    const swapIdx = direction === "up" ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newApprovers.length) return
    ;[newApprovers[index], newApprovers[swapIdx]] = [newApprovers[swapIdx], newApprovers[index]]
    markDirty("approvalCommittee")
    setCommittee((prev) => ({ ...prev, approvers: newApprovers }))
  }

  function removeApprover(id: string) {
    markDirty("approvalCommittee")
    setCommittee((prev) => ({ ...prev, approvers: prev.approvers.filter((a) => a !== id) }))
  }

  function addApprover() {
    if (!committeeAddId) return
    markDirty("approvalCommittee")
    setCommittee((prev) => ({ ...prev, approvers: [...prev.approvers, committeeAddId] }))
    setCommitteeAddId("")
    setCommitteeError(null)
  }

  async function handleSaveCommittee() {
    if (committee.approvers.length === 0) {
      setCommitteeError("Approval committee must have at least one approver. Set an approval threshold to auto-approve low amounts instead.")
      return
    }
    setCommitteeError(null)
    setSavingCommittee(true)
    const ok = await saveConfig("approvalCommittee", committee, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Approval committee saved")
      markClean("approvalCommittee")
      savedRef.current = { ...savedRef.current, committee }
    } else {
      toast.error("Failed to save approval committee")
    }
    setSavingCommittee(false)
  }

  async function handleSaveFO() {
    setSavingFO(true)
    const value = financeOfficerId ? { userId: financeOfficerId } : null
    const ok = await saveConfig("financeOfficer", value, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Finance Officer saved")
      markClean("financeOfficer")
      savedRef.current = { ...savedRef.current, financeOfficerId }
    } else {
      toast.error("Failed to save Finance Officer")
    }
    setSavingFO(false)
  }

  async function handleSaveDeadlines() {
    setSavingDeadlines(true)
    const [ok1, ok2, ok3] = await Promise.all([
      saveConfig("submissionDeadline", submissionDeadline, selectedCC?.id ?? null),
      saveConfig("approvalDeadline", approvalDeadline, selectedCC?.id ?? null),
      saveConfig("paymentDeadline", paymentDeadline, selectedCC?.id ?? null),
    ])
    if (ok1 && ok2 && ok3) {
      toast.success("Deadlines saved")
      markClean("submissionDeadline", "approvalDeadline", "paymentDeadline")
      savedRef.current = { ...savedRef.current, submissionDeadline, approvalDeadline, paymentDeadline }
    } else {
      toast.error("Failed to save deadlines")
    }
    setSavingDeadlines(false)
  }

  async function handleSaveMaxAmounts() {
    setSavingMaxAmounts(true)
    const ok = await saveConfig("maxAmountPerCategory", maxAmounts, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Category limits saved")
      markClean("maxAmountPerCategory")
      savedRef.current = { ...savedRef.current, maxAmounts }
    } else {
      toast.error("Failed to save category limits")
    }
    setSavingMaxAmounts(false)
  }

  async function handleSaveReceipt() {
    setSavingReceipt(true)
    const ok = await saveConfig("requireReceiptAbove", requireReceiptAbove, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Receipt threshold saved")
      markClean("requireReceiptAbove")
      savedRef.current = { ...savedRef.current, requireReceiptAbove }
    } else {
      toast.error("Failed to save receipt threshold")
    }
    setSavingReceipt(false)
  }

  async function handleSaveLimits() {
    setSavingLimits(true)
    const [ok1, ok2] = await Promise.all([
      saveConfig("maxAmountPerRequest", maxAmountPerRequest, selectedCC?.id ?? null),
      saveConfig("approvalThreshold", approvalThreshold, selectedCC?.id ?? null),
    ])
    if (ok1 && ok2) {
      toast.success("Spending limits saved")
      markClean("maxAmountPerRequest", "approvalThreshold")
      savedRef.current = { ...savedRef.current, maxAmountPerRequest, approvalThreshold }
    } else {
      toast.error("Failed to save spending limits")
    }
    setSavingLimits(false)
  }

  async function handleSaveCategories() {
    setSavingCategories(true)
    const ok = await saveConfig("allowedCategories", allowedCategories, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Allowed categories saved")
      markClean("allowedCategories")
      savedRef.current = { ...savedRef.current, allowedCategories }
    } else {
      toast.error("Failed to save allowed categories")
    }
    setSavingCategories(false)
  }

  async function handleSaveNotif() {
    setSavingNotif(true)
    const ok = await saveConfig("notificationChannels", notifChannels, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Notification channels saved")
      markClean("notificationChannels")
      savedRef.current = { ...savedRef.current, notifChannels }
    } else {
      toast.error("Failed to save notification channels")
    }
    setSavingNotif(false)
  }

  async function handleSaveResubmit() {
    setSavingResubmit(true)
    const ok = await saveConfig("resubmitBehavior", resubmitBehavior, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Resubmit behavior saved")
      markClean("resubmitBehavior")
      savedRef.current = { ...savedRef.current, resubmitBehavior }
    } else {
      toast.error("Failed to save resubmit behavior")
    }
    setSavingResubmit(false)
  }

  async function handleSaveCustomCategories() {
    setSavingCustomCategories(true)
    const ok = await saveConfig("customCategories", customCategories, selectedCC?.id ?? null)
    if (ok) {
      toast.success("Custom categories saved")
      markClean("customCategories")
      savedRef.current = { ...savedRef.current, customCategories }
    } else {
      toast.error("Failed to save custom categories")
    }
    setSavingCustomCategories(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading configuration...</div>
  }

  const financeUsers = users.filter((u) => u.role === "FINANCE")

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">System Configuration</h1>

      {/* Cost Center Selector */}
      {loadingCCs ? (
        <div className="text-sm text-gray-400">Loading cost centers...</div>
      ) : costCenters.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          No cost centers configured. <a href="/admin/cost-centers" className="underline">Add a cost center</a> to begin per-CC configuration.
        </div>
      ) : (
        <>
          <CostCenterSelector
            costCenters={costCenters}
            selectedCC={selectedCC}
            onSelect={setSelectedCC}
          />
          {selectedCC && (
            <div className="flex items-center gap-2 text-sm text-blue-700 font-medium bg-blue-50 rounded-lg px-4 py-2 border border-blue-100">
              <Building2 className="h-4 w-4 shrink-0" />
              Configuring: <span className="font-semibold">{selectedCC.name}</span>
              <span className="text-gray-400 text-xs font-normal">({selectedCC.code})</span>
            </div>
          )}
          {/* Unsaved changes banner */}
          {isDirty && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
              <span>You have unsaved changes.</span>
              <Button variant="ghost" size="sm" onClick={handleDiscardAll}>
                Discard
              </Button>
            </div>
          )}
        </>
      )}

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
                onChange={() => { setCommittee((p) => ({ ...p, mode: "sequential" })); markDirty("approvalCommittee") }}
              />
              Sequential
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="parallel"
                checked={committee.mode === "parallel"}
                onChange={() => { setCommittee((p) => ({ ...p, mode: "parallel" })); markDirty("approvalCommittee") }}
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
          {committeeError && (
            <p className="text-sm text-red-500">{committeeError}</p>
          )}
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
              onChange={(e) => { setFinanceOfficerId(e.target.value || null); markDirty("financeOfficer") }}
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
              onChange={(e) => { setSubmissionDeadline(Number(e.target.value)); markDirty("submissionDeadline") }}
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
              onChange={(e) => { setApprovalDeadline(Number(e.target.value)); markDirty("approvalDeadline") }}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="paymentDeadline">Payment Deadline (business days)</Label>
            <Input
              id="paymentDeadline"
              type="number"
              min={1}
              step={1}
              value={paymentDeadline}
              onChange={(e) => { setPaymentDeadline(Number(e.target.value)); markDirty("paymentDeadline") }}
              className="w-full"
            />
            <p className="text-xs text-gray-500">Business days after approval for Finance Officer to pay</p>
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
                <th className="px-4 py-2 text-left font-medium text-gray-600">Max Amount ({currency})</th>
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
                      onChange={(e) => {
                        setMaxAmounts((prev) => ({ ...prev, [cat]: Number(e.target.value) }))
                        markDirty("maxAmountPerCategory")
                      }}
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
          <Label htmlFor="requireReceiptAbove">Require receipt for amounts above ({currency})</Label>
          <Input
            id="requireReceiptAbove"
            type="number"
            min={0}
            value={requireReceiptAbove}
            onChange={(e) => { setRequireReceiptAbove(Number(e.target.value)); markDirty("requireReceiptAbove") }}
          />
        </div>
      </SectionCard>

      {/* 5. Spending Limits */}
      <SectionCard
        title="Spending Limits"
        metaKey="maxAmountPerRequest"
        meta={meta}
        onSave={handleSaveLimits}
        saving={savingLimits}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="maxAmountPerRequest">Overall Request Limit</Label>
            <Input
              id="maxAmountPerRequest"
              type="number"
              min={0}
              step={1}
              value={maxAmountPerRequest}
              onChange={(e) => { setMaxAmountPerRequest(Number(e.target.value)); markDirty("maxAmountPerRequest") }}
              className="w-full"
            />
            <p className="text-xs text-gray-500">Maximum amount per reimbursement request (0 = no limit)</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="approvalThreshold">Auto-Approve Threshold</Label>
            <Input
              id="approvalThreshold"
              type="number"
              min={0}
              step={1}
              value={approvalThreshold}
              onChange={(e) => { setApprovalThreshold(Number(e.target.value)); markDirty("approvalThreshold") }}
              className="w-full"
            />
            <p className="text-xs text-gray-500">Requests at or below this amount skip approvers (0 = disabled)</p>
          </div>
        </div>
      </SectionCard>

      {/* 6. Allowed Categories */}
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
                  markDirty("allowedCategories")
                }}
              />
              <span className="text-sm capitalize">{cat.charAt(0) + cat.slice(1).toLowerCase()}</span>
            </label>
          ))}
        </div>
      </SectionCard>

      {/* 9. Custom Categories */}
      <SectionCard
        title="Custom Categories"
        metaKey="customCategories"
        meta={meta}
        onSave={handleSaveCustomCategories}
        saving={savingCustomCategories}
      >
        <p className="text-xs text-gray-500">
          Add categories beyond the 12 defaults. Custom codes must be uppercase letters, digits, and underscores (e.g. CONF_FEES).
        </p>

        {/* Existing custom category rows */}
        {customCategories.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No custom categories yet.</p>
        ) : (
          <ul className="space-y-2">
            {customCategories.map((cat, idx) => (
              <li key={cat.code} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <input
                  type="checkbox"
                  checked={cat.enabled}
                  onChange={(e) => {
                    setCustomCategories((prev) =>
                      prev.map((c, i) => i === idx ? { ...c, enabled: e.target.checked } : c)
                    )
                    markDirty("customCategories")
                  }}
                  title="Enable/disable"
                />
                <input
                  type="text"
                  value={cat.name}
                  onChange={(e) => {
                    setCustomCategories((prev) =>
                      prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c)
                    )
                    markDirty("customCategories")
                  }}
                  maxLength={60}
                  className="flex-1 text-sm border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1"
                  placeholder="Category name"
                />
                <span className="text-xs text-gray-400 font-mono">{cat.code}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                  onClick={() => {
                    setCustomCategories((prev) => prev.filter((_, i) => i !== idx))
                    markDirty("customCategories")
                  }}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add new category form */}
        <AddCustomCategoryRow
          existingCodes={[
            ...CATEGORIES,
            ...customCategories.map((c) => c.code),
          ]}
          onAdd={(cat) => { setCustomCategories((prev) => [...prev, cat]); markDirty("customCategories") }}
        />
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
                onChange={(e) => {
                  setNotifChannels((prev) => ({ ...prev, [key]: e.target.checked }))
                  markDirty("notificationChannels")
                }}
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
              onChange={() => { setResubmitBehavior("reset"); markDirty("resubmitBehavior") }}
            />
            Reset to beginning
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="continue"
              checked={resubmitBehavior === "continue"}
              onChange={() => { setResubmitBehavior("continue"); markDirty("resubmitBehavior") }}
            />
            Continue from current step
          </label>
        </div>
      </SectionCard>

      {/* 8. Role Assignments moved to Cost Centers page */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        Role assignments (Approvers, Finance Officers) are managed in{" "}
        <a href="/admin/cost-centers" className="font-medium underline hover:text-blue-900">
          User Cost Centers
        </a>.
      </div>

      {/* 9. Per Diem Rates */}
      <PerDiemSection selectedCC={selectedCC} />
    </div>
  )
}

function PerDiemSection({ selectedCC }: { selectedCC: { id: string; code: string; name: string; currency: string; countryCode: string } | null }) {
  const [rates, setRates] = useState<PerDiemRateTable>({})
  const [isOverride, setIsOverride] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newCountryCode, setNewCountryCode] = useState("")
  const [newCountryError, setNewCountryError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const qs = selectedCC?.id ? `?costCenterId=${selectedCC.id}` : ""
    const data = await fetch(`/api/per-diem/admin/rates${qs}`).then((r) => r.json())
    setRates(data.rates ?? {})
    setIsOverride(!!data.isOverride)
  }, [selectedCC?.id])

  useEffect(() => { load() }, [load])

  function setCountry(cc: string, rate: PerDiemRate) {
    setRates((prev) => ({ ...prev, [cc]: rate }))
  }
  function removeCountry(cc: string) {
    setRates((prev) => { const next = { ...prev }; delete next[cc]; return next })
  }
  function addCountry() {
    const cc = newCountryCode.trim().toUpperCase()
    if (!cc.match(/^[A-Z]{2}$/)) {
      setNewCountryError("Must be a 2-letter ISO country code (e.g. JP, MY)")
      return
    }
    if (rates[cc]) {
      setNewCountryError(`${cc} already exists — edit it directly`)
      return
    }
    setNewCountryError(null)
    setCountry(cc, { standard: 100 })
    setNewCountryCode("")
  }

  async function save() {
    setBusy(true); setSaved(false)
    try {
      const res = await fetch("/api/per-diem/admin/rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates, costCenterId: selectedCC?.id ?? null }),
      })
      if (res.ok) { setSaved(true); load() }
      else toast.error("Failed to save per diem rates")
    } finally { setBusy(false); setTimeout(() => setSaved(false), 2500) }
  }

  async function reset() {
    const target = selectedCC?.name ?? "this cost center"
    if (!confirm(`Remove the override for ${target}? Rates fall back to the parent layer / built-in defaults.`)) return
    setBusy(true)
    try {
      const qs = selectedCC?.id ? `?costCenterId=${selectedCC.id}` : ""
      await fetch(`/api/per-diem/admin/rates${qs}`, { method: "DELETE" })
      load()
    } finally { setBusy(false) }
  }

  const entries = Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">Per Diem Rates</CardTitle>
            <p className="text-xs text-gray-500 mt-1 max-w-xl">
              Set the daily rate per country (USD). Each cost center can layer its own overrides on top of the org-wide bucket.
            </p>
          </div>
          <span className={`text-xs ${isOverride ? "text-blue-700" : "text-gray-500"}`}>
            {isOverride ? "Custom override" : "Inherited from parent layer / defaults"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Country rates</h2>
          </div>
          {entries.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">No rates configured. Add a country below to start.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map(([cc, r]) => (
                <PerDiemCountryRow
                  key={cc}
                  code={cc}
                  rate={r}
                  onChange={(next) => setCountry(cc, next)}
                  onRemove={() => removeCountry(cc)}
                />
              ))}
            </div>
          )}
          <div className="border-t border-gray-100 px-5 py-3 space-y-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCountryCode}
                onChange={(e) => { setNewCountryCode(e.target.value.toUpperCase().slice(0, 2)); setNewCountryError(null) }}
                placeholder="ISO-2 code (e.g. JP)"
                maxLength={2}
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
              />
              <button
                onClick={addCountry}
                disabled={!newCountryCode.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add country
              </button>
            </div>
            {newCountryError && <p className="text-xs text-red-500">{newCountryError}</p>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save rates
          </button>
          {isOverride && (
            <button onClick={reset} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </button>
          )}
          {saved && (
            <span className="inline-flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PerDiemCountryRow({ code, rate, onChange, onRemove }: { code: string; rate: PerDiemRate; onChange: (r: PerDiemRate) => void; onRemove: () => void }) {
  const [hasHighCost, setHasHighCost] = useState(typeof rate.highCost === "number")
  return (
    <div className="grid gap-3 px-5 py-3 md:grid-cols-12 items-start">
      <div className="md:col-span-1 font-mono text-sm font-semibold text-gray-900 mt-2">{code}</div>
      <label className="md:col-span-3 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Standard / day (USD)</span>
        <input
          type="number" min={0} max={2000} step={1}
          value={rate.standard}
          onChange={(e) => onChange({ ...rate, standard: Number(e.target.value) })}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums"
        />
      </label>
      <label className="md:col-span-3 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          High-cost rate (USD)
          <input type="checkbox" checked={hasHighCost} onChange={(e) => {
            setHasHighCost(e.target.checked)
            if (!e.target.checked) {
              const { highCost: _h, highCostCities: _c, ...rest } = rate
              void _h; void _c
              onChange(rest)
            } else {
              onChange({ ...rate, highCost: rate.highCost ?? rate.standard, highCostCities: rate.highCostCities ?? [] })
            }
          }} className="ml-2 align-middle" />
        </span>
        <input
          type="number" min={0} max={2000} step={1} disabled={!hasHighCost}
          value={rate.highCost ?? ""}
          onChange={(e) => onChange({ ...rate, highCost: Number(e.target.value) })}
          placeholder="—"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums disabled:bg-gray-50"
        />
      </label>
      <label className="md:col-span-4 block">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">High-cost cities (comma-separated)</span>
        <input
          disabled={!hasHighCost}
          value={(rate.highCostCities ?? []).join(", ")}
          onChange={(e) => onChange({ ...rate, highCostCities: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="Riyadh, Jeddah"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />
      </label>
      <div className="md:col-span-1 flex justify-end mt-1">
        <button type="button" onClick={onRemove} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Remove country">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
