"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Search, Layers } from "lucide-react"

interface User {
  id: string
  name: string | null
  email: string | null
  role: "EMPLOYEE" | "APPROVER" | "FINANCE" | "ADMIN" | "SUPER_ADMIN"
  status: "ACTIVE" | "INACTIVE" | "PENDING"
  department: string | null
  managerId: string | null
  organizationId: string | null
  createdAt: string
  manager: { name: string | null } | null
  organization: { id: string; name: string } | null
  _count: { requests: number }
}

const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN", "SUPER_ADMIN"] as const
type Role = typeof ROLES[number]
const STATUSES = ["ACTIVE", "PENDING", "INACTIVE"] as const
type Status = typeof STATUSES[number]

const ROLE_BADGE_CLASSES: Record<Role, string> = {
  EMPLOYEE: "bg-gray-100 text-gray-700",
  APPROVER: "bg-blue-100 text-blue-700",
  FINANCE: "bg-green-100 text-green-700",
  ADMIN: "bg-red-100 text-red-700",
  SUPER_ADMIN: "bg-purple-100 text-purple-700",
}
function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[role]}`}>
      {role}
    </span>
  )
}
const STATUS_BADGE_CLASSES: Record<Status, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  PENDING: "bg-yellow-100 text-yellow-700",
}
function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}>
      {status}
    </span>
  )
}

type SortKey = "name" | "email" | "role" | "status" | "department" | "organization" | "manager" | "requests" | "createdAt"
type SortDir = "asc" | "desc"

const EMPTY_ADD = { name: "", email: "", role: "EMPLOYEE" as Role, department: "", managerId: "", organizationId: "" }
const EMPTY_EDIT = { role: "EMPLOYEE" as Role, status: "ACTIVE" as Status, department: "", managerId: "", organizationId: "" }

const NO_ORG = "__noorg__"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])

  // Filters
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"" | Role>("")
  const [statusFilter, setStatusFilter] = useState<"" | Status>("")
  const [orgFilter, setOrgFilter] = useState("")

  // View mode
  const [groupByOrg, setGroupByOrg] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Dialogs
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_ADD)
  const [adding, setAdding] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [editing, setEditing] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/users")
    if (res.ok) setUsers(await res.json())
    else toast.error("Failed to load users")
    setLoading(false)
  }, [])
  const fetchOrgs = useCallback(async () => {
    const res = await fetch("/api/admin/organizations")
    if (res.ok) setOrgs(await res.json())
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchOrgs()
  }, [fetchUsers, fetchOrgs])

  const managerOptions = users.filter((u) => u.role === "APPROVER" || u.role === "ADMIN")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false
      if (statusFilter && u.status !== statusFilter) return false
      if (orgFilter) {
        if (orgFilter === NO_ORG) {
          if (u.organizationId) return false
        } else if (u.organizationId !== orgFilter) {
          return false
        }
      }
      if (q) {
        const hay = `${u.name ?? ""} ${u.email ?? ""} ${u.department ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [users, roleFilter, statusFilter, orgFilter, search])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const getVal = (u: User): string | number => {
      switch (sortKey) {
        case "name": return (u.name ?? "").toLowerCase()
        case "email": return (u.email ?? "").toLowerCase()
        case "role": return u.role
        case "status": return u.status
        case "department": return (u.department ?? "").toLowerCase()
        case "organization": return (u.organization?.name ?? "").toLowerCase()
        case "manager": return (u.manager?.name ?? "").toLowerCase()
        case "requests": return u._count.requests
        case "createdAt": return new Date(u.createdAt).getTime()
      }
    }
    arr.sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (av < bv) return sortDir === "asc" ? -1 : 1
      if (av > bv) return sortDir === "asc" ? 1 : -1
      return 0
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // Group by org
  const grouped = useMemo(() => {
    const map = new Map<string, { orgId: string; orgName: string; users: User[] }>()
    for (const u of sorted) {
      const orgId = u.organizationId ?? NO_ORG
      const orgName = u.organization?.name ?? "No organization"
      if (!map.has(orgId)) map.set(orgId, { orgId, orgName, users: [] })
      map.get(orgId)!.users.push(u)
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.orgId === NO_ORG) return 1
      if (b.orgId === NO_ORG) return -1
      return a.orgName.localeCompare(b.orgName)
    })
  }, [sorted])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  async function handleAdd() {
    setAdding(true)
    try {
      const body: Record<string, unknown> = { name: addForm.name, email: addForm.email, role: addForm.role }
      if (addForm.department) body.department = addForm.department
      if (addForm.managerId) body.managerId = addForm.managerId
      if (addForm.organizationId) body.organizationId = addForm.organizationId
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success("User created successfully")
        setAddOpen(false)
        setAddForm(EMPTY_ADD)
        await fetchUsers()
      } else {
        const data = await res.json()
        toast.error(data.error ?? "Failed to create user")
      }
    } catch {
      toast.error("Failed to create user")
    } finally {
      setAdding(false)
    }
  }

  function openEdit(user: User) {
    setEditUser(user)
    setEditForm({
      role: user.role,
      status: user.status,
      department: user.department ?? "",
      managerId: user.managerId ?? "",
      organizationId: user.organizationId ?? "",
    })
    setEditOpen(true)
  }
  async function handleEdit() {
    if (!editUser) return
    setEditing(true)
    try {
      const body: Record<string, unknown> = {
        role: editForm.role,
        status: editForm.status,
        department: editForm.department || null,
        managerId: editForm.managerId || null,
        organizationId: editForm.organizationId || null,
      }
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success("User updated successfully")
        setEditOpen(false)
        setEditUser(null)
        await fetchUsers()
      } else {
        const data = await res.json()
        toast.error(data.error ?? "Failed to update user")
      }
    } catch {
      toast.error("Failed to update user")
    } finally {
      setEditing(false)
    }
  }

  const hasFilters = !!(search || roleFilter || statusFilter || orgFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Users (All Organizations)</h1>
          <p className="text-sm text-gray-500 mt-1">
            {sorted.length} of {users.length} users{hasFilters ? " (filtered)" : ""}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, department…"
                className="pl-8 h-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | Status)}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700"
            >
              <option value="">All organizations</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              <option value={NO_ORG}>— No organization —</option>
            </select>
            <Button
              variant={groupByOrg ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupByOrg((g) => !g)}
              className="h-9"
            >
              <Layers className="h-4 w-4 mr-1" />
              {groupByOrg ? "Grouped by org" : "Group by org"}
            </Button>
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); setOrgFilter("") }}
                className="text-xs text-gray-500 hover:text-gray-900 px-2 h-9"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(["", ...ROLES] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r as "" | Role)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  roleFilter === r
                    ? "bg-gray-900 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {r === "" ? "All Roles" : r}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading users...</div>
      ) : sorted.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">No users match your filters.</CardContent></Card>
      ) : groupByOrg ? (
        <div className="space-y-4">
          {grouped.map((g) => {
            const isCollapsed = collapsed[g.orgId]
            return (
              <Card key={g.orgId}>
                <button
                  className="w-full flex items-center justify-between px-4 py-3 border-b hover:bg-gray-50"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.orgId]: !c[g.orgId] }))}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                    <span className="font-semibold text-gray-900">{g.orgName}</span>
                    <span className="text-xs text-gray-500">{g.users.length} user{g.users.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {g.users.filter(u => u.status === "ACTIVE").length} active · {g.users.filter(u => u.status === "PENDING").length} pending
                  </div>
                </button>
                {!isCollapsed && (
                  <UserTable
                    users={g.users}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    toggleSort={toggleSort}
                    onEdit={openEdit}
                    showOrgColumn={false}
                  />
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <UserTable
            users={sorted}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            onEdit={openEdit}
            showOrgColumn
          />
        </Card>
      )}

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label htmlFor="add-name">Name</Label>
              <Input id="add-name" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
            <div className="space-y-1"><Label htmlFor="add-email">Email</Label>
              <Input id="add-email" type="email" value={addForm.email} onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))} placeholder="user@example.com" /></div>
            <div className="space-y-1"><Label htmlFor="add-role">Role</Label>
              <select id="add-role" value={addForm.role} onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value as Role }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="add-dept">Department (optional)</Label>
              <Input id="add-dept" value={addForm.department} onChange={(e) => setAddForm((p) => ({ ...p, department: e.target.value }))} placeholder="e.g. Engineering" /></div>
            <div className="space-y-1"><Label htmlFor="add-manager">Manager (optional)</Label>
              <select id="add-manager" value={addForm.managerId} onChange={(e) => setAddForm((p) => ({ ...p, managerId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">No manager</option>
                {managerOptions.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.role})</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="add-org">Organization (optional)</Label>
              <select id="add-org" value={addForm.organizationId} onChange={(e) => setAddForm((p) => ({ ...p, organizationId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">No organization</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !addForm.name || !addForm.email}>{adding ? "Creating..." : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {editUser?.name ?? editUser?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label htmlFor="edit-role">Role</Label>
              <select id="edit-role" value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as Role }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="edit-status">Status</Label>
              <select id="edit-status" value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as Status }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="edit-dept">Department</Label>
              <Input id="edit-dept" value={editForm.department} onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))} placeholder="e.g. Engineering" /></div>
            <div className="space-y-1"><Label htmlFor="edit-manager">Manager</Label>
              <select id="edit-manager" value={editForm.managerId} onChange={(e) => setEditForm((p) => ({ ...p, managerId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">No manager</option>
                {managerOptions.filter((u) => u.id !== editUser?.id).map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email} ({u.role})</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="edit-org">Organization</Label>
              <select id="edit-org" value={editForm.organizationId} onChange={(e) => setEditForm((p) => ({ ...p, organizationId: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="">No organization</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editing}>{editing ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortHeader({
  label, k, sortKey, sortDir, onClick, align = "left",
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: (k: SortKey) => void; align?: "left" | "right"
}) {
  const active = sortKey === k
  return (
    <th className={`px-4 py-3 font-medium text-gray-600 text-${align}`}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? "text-gray-900" : ""}`}>
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )
}

function UserTable({
  users, sortKey, sortDir, toggleSort, onEdit, showOrgColumn,
}: {
  users: User[]
  sortKey: SortKey
  sortDir: SortDir
  toggleSort: (k: SortKey) => void
  onEdit: (u: User) => void
  showOrgColumn: boolean
}) {
  return (
    <CardContent className="p-0">
      <div className="rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <SortHeader label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Email" k="email" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Role" k="role" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Department" k="department" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              {showOrgColumn && <SortHeader label="Organization" k="organization" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />}
              <SortHeader label="Manager" k="manager" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader label="Requests" k="requests" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <th className="px-4 py-3 font-medium text-gray-600 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600">{user.email ?? "—"}</td>
                <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
                <td className="px-4 py-3 text-gray-600">{user.department ?? "—"}</td>
                {showOrgColumn && <td className="px-4 py-3 text-gray-600">{user.organization?.name ?? "—"}</td>}
                <td className="px-4 py-3 text-gray-600">{user.manager?.name ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-600">{user._count.requests}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEdit(user)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  )
}
