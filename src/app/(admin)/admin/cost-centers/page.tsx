"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus, Save, Trash2, Building2, Users as UsersIcon, Power } from "lucide-react"

// Admin → Cost Centers.
// Each cost center is a regional sub-org with its own ISO country, currency,
// and (eventually) its own approver/finance routing. Users are assigned to
// a cost center to drive their reimbursement payout currency.

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
  costCenterId: string | null
  costCenter: { id: string; code: string; name: string; currency: string } | null
  organizationId: string | null
}

export default function CostCentersPage() {
  const [items, setItems] = useState<CostCenter[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cc, u] = await Promise.all([
        fetch("/api/admin/cost-centers").then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
      ])
      setItems(cc.costCenters ?? [])
      setUsers(Array.isArray(u) ? u : [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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
        await load()
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
        await load()
      }
    } finally { setBusy(null) }
  }

  return (
    <div className="max-w-5xl space-y-5 p-1">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regional Cost Centers</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Each cost center is a regional office (e.g. Indonesia, Vietnam) with its own ISO country and payout currency.
            Every reimbursement raised by a user assigned to a cost center is converted into that cost center&apos;s currency
            on submit. Per-diem requests can override the payout currency on a per-trip basis.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1E3F] px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-3.5 w-3.5" /> New cost center
        </button>
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
              onSaved={() => { setAdding(false); load() }}
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
              onSave={(patch) => save(cc.id, patch)}
              onDelete={() => remove(cc)}
            />
          ))}
        </div>
      )}

      {/* Unassigned users sidebar — admins should clean these up so the
          currency rule applies uniformly. */}
      <UnassignedUsers
        users={users.filter((u) => !u.costCenterId)}
        costCenters={items}
        onAssigned={load}
      />
    </div>
  )
}

function CostCenterCard({
  cc,
  users,
  busy,
  onSave,
  onDelete,
}: {
  cc: CostCenter
  users: UserRow[]
  busy: boolean
  onSave: (patch: Partial<CostCenter>) => void
  onDelete: () => void
}) {
  const [draft, setDraft] = useState({ name: cc.name, countryCode: cc.countryCode, currency: cc.currency, active: cc.active })
  useEffect(() => setDraft({ name: cc.name, countryCode: cc.countryCode, currency: cc.currency, active: cc.active }), [cc])
  const dirty = draft.name !== cc.name || draft.countryCode !== cc.countryCode || draft.currency !== cc.currency || draft.active !== cc.active

  const byRole = useMemo(() => {
    const buckets: Record<string, UserRow[]> = {}
    for (const u of users) {
      const r = u.role
      buckets[r] ??= []
      buckets[r].push(u)
    }
    return buckets
  }, [users])

  return (
    <article className={`rounded-xl border bg-white ${cc.active ? "border-gray-200" : "border-gray-200 opacity-75"}`}>
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

      {Object.keys(byRole).length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Assigned members</p>
          <div className="grid gap-2 md:grid-cols-2">
            {Object.entries(byRole).map(([role, list]) => (
              <div key={role}>
                <p className="text-[10px] font-mono uppercase text-gray-500 mb-1">{role.replace("_", " ").toLowerCase()}</p>
                <ul className="space-y-0.5">
                  {list.map((u) => (
                    <li key={u.id} className="truncate text-xs text-gray-700">
                      {u.name ?? u.email}
                      <span className="text-gray-400"> · {u.email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
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
  if (users.length === 0 || costCenters.length === 0) return null
  const active = costCenters.filter((c) => c.active)

  async function assign(userId: string, costCenterId: string) {
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
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40">
      <header className="border-b border-amber-200/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-amber-900">Unassigned users ({users.length})</h2>
        <p className="text-xs text-amber-800/80 mt-0.5">
          These users will fall through to the organization base currency. Assign them to a cost center to scope their reimbursements.
        </p>
      </header>
      <ul className="divide-y divide-amber-100">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-5 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">{u.name ?? "—"}</p>
              <p className="text-xs text-gray-500">{u.email} · {u.role}</p>
            </div>
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) assign(u.id, e.target.value) }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
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
