"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus } from "lucide-react"

interface User {
  id: string
  name: string | null
  email: string | null
  role: "EMPLOYEE" | "APPROVER" | "FINANCE" | "ADMIN"
  status: "ACTIVE" | "INACTIVE" | "PENDING"
  department: string | null
  managerId: string | null
  organizationId: string | null
  createdAt: string
  manager: { name: string | null } | null
  organization: { id: string; name: string } | null
  _count: { requests: number }
}

const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const
type Role = typeof ROLES[number]

const ROLE_BADGE_CLASSES: Record<Role, string> = {
  EMPLOYEE: "bg-gray-100 text-gray-700",
  APPROVER: "bg-blue-100 text-blue-700",
  FINANCE: "bg-green-100 text-green-700",
  ADMIN: "bg-red-100 text-red-700",
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_CLASSES[role]}`}
    >
      {role}
    </span>
  )
}

const STATUS_BADGE_CLASSES = {
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE: "bg-gray-100 text-gray-500",
  PENDING: "bg-yellow-100 text-yellow-700",
}
function StatusBadge({ status }: { status: "ACTIVE" | "INACTIVE" | "PENDING" }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}>
      {status}
    </span>
  )
}

const EMPTY_ADD = { name: "", email: "", role: "EMPLOYEE" as Role, department: "", managerId: "", organizationId: "" }
const EMPTY_EDIT = { role: "EMPLOYEE" as Role, status: "ACTIVE" as "ACTIVE" | "INACTIVE" | "PENDING", department: "", managerId: "", organizationId: "" }

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState("")
  const [orgFilter, setOrgFilter] = useState("")
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState(EMPTY_ADD)
  const [adding, setAdding] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [editing, setEditing] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/users")
    if (res.ok) {
      const data = await res.json()
      setUsers(data)
    } else {
      toast.error("Failed to load users")
    }
    setLoading(false)
  }, [])

  const fetchOrgs = useCallback(async () => {
    const res = await fetch("/api/admin/organizations")
    if (res.ok) {
      const data = await res.json()
      setOrgs(data)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchOrgs()
  }, [fetchUsers, fetchOrgs])

  const managerOptions = users.filter((u) => u.role === "APPROVER" || u.role === "ADMIN")

  const filteredUsers = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false
    if (orgFilter && u.organizationId !== orgFilter) return false
    return true
  })

  async function handleAdd() {
    setAdding(true)
    try {
      const body: Record<string, unknown> = {
        name: addForm.name,
        email: addForm.email,
        role: addForm.role,
      }
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {(["", "EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
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
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="h-7 rounded-md border border-gray-200 bg-white px-2 py-0 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Organizations</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        {(roleFilter || orgFilter) && (
          <button
            onClick={() => { setRoleFilter(""); setOrgFilter("") }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading users...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Department</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Organization</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Manager</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Requests</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {user.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{user.email ?? "—"}</td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{user.department ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{user.organization?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{user.manager?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {user._count.requests}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-role">Role</Label>
              <select
                id="add-role"
                value={addForm.role}
                onChange={(e) => setAddForm((p) => ({ ...p, role: e.target.value as Role }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-dept">Department (optional)</Label>
              <Input
                id="add-dept"
                value={addForm.department}
                onChange={(e) => setAddForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Engineering"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-manager">Manager (optional)</Label>
              <select
                id="add-manager"
                value={addForm.managerId}
                onChange={(e) => setAddForm((p) => ({ ...p, managerId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">No manager</option>
                {managerOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name ?? u.email} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-org">Organization (optional)</Label>
              <select
                id="add-org"
                value={addForm.organizationId}
                onChange={(e) => setAddForm((p) => ({ ...p, organizationId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">No organization</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !addForm.name || !addForm.email}
            >
              {adding ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit User — {editUser?.name ?? editUser?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit-role">Role</Label>
              <select
                id="edit-role"
                value={editForm.role}
                onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value as Role }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                value={editForm.status}
                onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as "ACTIVE" | "INACTIVE" | "PENDING" }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-dept">Department</Label>
              <Input
                id="edit-dept"
                value={editForm.department}
                onChange={(e) => setEditForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Engineering"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-manager">Manager</Label>
              <select
                id="edit-manager"
                value={editForm.managerId}
                onChange={(e) => setEditForm((p) => ({ ...p, managerId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">No manager</option>
                {managerOptions
                  .filter((u) => u.id !== editUser?.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email} ({u.role})
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-org">Organization</Label>
              <select
                id="edit-org"
                value={editForm.organizationId}
                onChange={(e) => setEditForm((p) => ({ ...p, organizationId: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">No organization</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
