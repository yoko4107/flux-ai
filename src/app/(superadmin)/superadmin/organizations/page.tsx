"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Pencil, Trash2, Building2 } from "lucide-react"

interface Org {
  id: string
  name: string
  slug: string
  industry: string | null
  createdAt: string
  _count: { users: number }
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [loading, setLoading] = useState(true)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: "", slug: "", industry: "" })
  const [adding, setAdding] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editOrg, setEditOrg] = useState<Org | null>(null)
  const [editForm, setEditForm] = useState({ name: "", industry: "" })
  const [editing, setEditing] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/admin/organizations")
    if (res.ok) setOrgs(await res.json())
    else toast.error("Failed to load organizations")
    setLoading(false)
  }, [])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  async function handleAdd() {
    setAdding(true)
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addForm.name, slug: addForm.slug, industry: addForm.industry || undefined }),
      })
      if (res.ok) {
        toast.success("Organization created")
        setAddOpen(false)
        setAddForm({ name: "", slug: "", industry: "" })
        await fetchOrgs()
      } else {
        const d = await res.json()
        toast.error(d.error ?? "Failed to create organization")
      }
    } catch { toast.error("Failed to create organization") }
    setAdding(false)
  }

  function openEdit(org: Org) {
    setEditOrg(org)
    setEditForm({ name: org.name, industry: org.industry ?? "" })
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editOrg) return
    setEditing(true)
    try {
      const res = await fetch(`/api/admin/organizations/${editOrg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editForm.name, industry: editForm.industry || null }),
      })
      if (res.ok) {
        toast.success("Organization updated")
        setEditOpen(false)
        await fetchOrgs()
      } else {
        const d = await res.json()
        toast.error(d.error ?? "Failed to update organization")
      }
    } catch { toast.error("Failed to update") }
    setEditing(false)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/organizations/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Organization deleted")
        setDeleteId(null)
        await fetchOrgs()
      } else {
        toast.error("Failed to delete organization")
      }
    } catch { toast.error("Failed to delete") }
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Organizations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage tenants and their members</p>
        </div>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Organization
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading organizations...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Slug</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Industry</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Members</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Created</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orgs.map((org) => (
                    <tr key={org.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          {org.name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{org.slug}</code>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{org.industry ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{org._count.users}</td>
                      <td className="px-4 py-3 text-gray-600">{new Date(org.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(org)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => setDeleteId(org.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orgs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No organizations yet. Add your first organization to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Organization</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value, slug: slugify(e.target.value) }))}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-slug">Slug <span className="text-gray-400 font-normal">(unique identifier)</span></Label>
              <Input
                id="org-slug"
                value={addForm.slug}
                onChange={(e) => setAddForm((p) => ({ ...p, slug: slugify(e.target.value) }))}
                placeholder="acme-corporation"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="org-industry">Industry (optional)</Label>
              <Input
                id="org-industry"
                value={addForm.industry}
                onChange={(e) => setAddForm((p) => ({ ...p, industry: e.target.value }))}
                placeholder="e.g. Technology, Finance, Healthcare"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !addForm.name || !addForm.slug}>
              {adding ? "Creating..." : "Create Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit — {editOrg?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="edit-org-name">Name</Label>
              <Input id="edit-org-name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Slug <span className="text-gray-400 font-normal">(cannot change)</span></Label>
              <Input value={editOrg?.slug ?? ""} disabled className="opacity-50" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-org-industry">Industry</Label>
              <Input id="edit-org-industry" value={editForm.industry} onChange={(e) => setEditForm((p) => ({ ...p, industry: e.target.value }))} placeholder="e.g. Technology" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editing || !editForm.name}>{editing ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Organization</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            This will unlink all members from this organization and delete it permanently. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
