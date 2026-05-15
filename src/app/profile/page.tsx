"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Shield, Building2, Mail, CheckCircle2, XCircle, Phone, Plus, X } from "lucide-react"

type NotificationPrefs = {
  email: boolean
  whatsapp: boolean
  inApp: boolean
  approvalUpdates: boolean
  paymentUpdates: boolean
  weeklyDigest: boolean
}

type EmailAlias = {
  type: "work" | "personal"
  email: string
}

type Profile = {
  id: string
  name: string | null
  email: string | null
  role: string
  department: string | null
  phone: string | null
  emailAliases: EmailAlias[] | null
  status: string
  kycVerified: boolean
  createdAt: string
  notificationPrefs: NotificationPrefs | null
  organization: { id: string; name: string; slug: string } | null
  manager: { id: string; name: string | null; email: string | null } | null
}

const DEFAULT_PREFS: NotificationPrefs = {
  email: true,
  whatsapp: false,
  inApp: true,
  approvalUpdates: true,
  paymentUpdates: true,
  weeklyDigest: false,
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  EMPLOYEE: { label: "Employee", color: "bg-blue-100 text-blue-700" },
  APPROVER: { label: "Approver", color: "bg-green-100 text-green-700" },
  FINANCE: { label: "Finance", color: "bg-amber-100 text-amber-700" },
  ADMIN: { label: "Admin", color: "bg-gray-100 text-gray-700" },
  SUPER_ADMIN: { label: "Super Admin", color: "bg-purple-100 text-purple-700" },
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState("")
  const [department, setDepartment] = useState("")
  const [phone, setPhone] = useState("")
  const [aliases, setAliases] = useState<EmailAlias[]>([])
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/profile")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          setError(data?.error || `HTTP ${r.status}`)
          return
        }
        const p = data as Profile
        setProfile(p)
        setName(p.name ?? "")
        setDepartment(p.department ?? "")
        setPhone(p.phone ?? "")
        setAliases(Array.isArray(p.emailAliases) ? p.emailAliases : [])
        setPrefs({ ...DEFAULT_PREFS, ...(p.notificationPrefs ?? {}) })
      })
      .catch((e) => setError(e?.message || "Network error"))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        department: department || null,
        phone: phone || null,
        emailAliases: aliases,
        notificationPrefs: prefs,
      }),
    })
    setSaving(false)
    if (res.ok) toast.success("Profile updated")
    else toast.error("Failed to save")
  }

  function addAlias(type: "work" | "personal") {
    setAliases((prev) => [...prev, { type, email: "" }])
  }

  function updateAlias(index: number, email: string) {
    setAliases((prev) => prev.map((a, i) => (i === index ? { ...a, email } : a)))
  }

  function removeAlias(index: number) {
    setAliases((prev) => prev.filter((_, i) => i !== index))
  }

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (!profile) return <div className="text-sm text-red-600">Unable to load profile{error ? `: ${error}` : "."}</div>

  const initials = (profile.name ?? profile.email ?? "U")
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
  const roleInfo = ROLE_LABEL[profile.role] ?? { label: profile.role, color: "bg-gray-100 text-gray-700" }

  const workAliases = aliases.filter((a) => a.type === "work")
  const personalAliases = aliases.filter((a) => a.type === "personal")

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-gray-500">Manage your account details and notification preferences.</p>
      </div>

      {/* Identity card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{profile.name || "Unnamed"}</CardTitle>
                <Badge className={roleInfo.color}>
                  <Shield className="h-3 w-3 mr-1" />
                  {roleInfo.label}
                </Badge>
                <Badge variant="outline" className="capitalize">
                  {profile.status.toLowerCase()}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-1 mt-1">
                <Mail className="h-3 w-3" /> {profile.email}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow
            icon={<Building2 className="h-4 w-4 text-gray-400" />}
            label="Organization"
            value={profile.organization?.name ?? "—"}
          />
          <InfoRow
            icon={profile.kycVerified ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-gray-400" />}
            label="KYC"
            value={profile.kycVerified ? "Verified" : "Not verified"}
          />
          <InfoRow label="Manager" value={profile.manager?.name ?? "—"} />
          <InfoRow label="Member since" value={new Date(profile.createdAt).toLocaleDateString()} />
        </CardContent>
      </Card>

      {/* Editable profile */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Update your display name, department, and contact info.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="dept">Department</Label>
              <Input id="dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
            </div>
          </div>
          <div>
            <Label htmlFor="phone">Phone number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+62 812 3456 7890"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email aliases */}
      <Card>
        <CardHeader>
          <CardTitle>Email aliases</CardTitle>
          <CardDescription>Add work or personal email addresses linked to your account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Work aliases */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Work</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => addAlias("work")}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {workAliases.length === 0 ? (
              <p className="text-xs text-gray-400">No work aliases added.</p>
            ) : (
              <div className="space-y-2">
                {aliases.map((alias, index) =>
                  alias.type !== "work" ? null : (
                    <div key={index} className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                      <Input
                        type="email"
                        value={alias.email}
                        onChange={(e) => updateAlias(index, e.target.value)}
                        placeholder="work@company.com"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeAlias(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Personal aliases */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Personal</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => addAlias("personal")}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {personalAliases.length === 0 ? (
              <p className="text-xs text-gray-400">No personal aliases added.</p>
            ) : (
              <div className="space-y-2">
                {aliases.map((alias, index) =>
                  alias.type !== "personal" ? null : (
                    <div key={index} className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                      <Input
                        type="email"
                        value={alias.email}
                        onChange={(e) => updateAlias(index, e.target.value)}
                        placeholder="personal@gmail.com"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeAlias(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification prefs */}
      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>Choose how and when FLUX.AI reaches you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3">Channels</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Email"
                description="Receive notifications by email"
                checked={prefs.email}
                onChange={(v) => setPrefs({ ...prefs, email: v })}
              />
              <ToggleRow
                label="WhatsApp"
                description="Get time-sensitive alerts on WhatsApp"
                checked={prefs.whatsapp}
                onChange={(v) => setPrefs({ ...prefs, whatsapp: v })}
              />
              <ToggleRow
                label="In-app"
                description="Show the bell notifications inside the app"
                checked={prefs.inApp}
                onChange={(v) => setPrefs({ ...prefs, inApp: v })}
              />
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Event types</h3>
            <div className="space-y-2">
              <ToggleRow
                label="Approval updates"
                description="When a request is approved, rejected, or needs changes"
                checked={prefs.approvalUpdates}
                onChange={(v) => setPrefs({ ...prefs, approvalUpdates: v })}
              />
              <ToggleRow
                label="Payment updates"
                description="When a reimbursement has been paid out"
                checked={prefs.paymentUpdates}
                onChange={(v) => setPrefs({ ...prefs, paymentUpdates: v })}
              />
              <ToggleRow
                label="Weekly digest"
                description="A Monday summary of pending activity"
                checked={prefs.weeklyDigest}
                onChange={(v) => setPrefs({ ...prefs, weeklyDigest: v })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  )
}

function ToggleRow({
  label, description, checked, onChange,
}: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-md px-2 -mx-2">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
    </label>
  )
}
