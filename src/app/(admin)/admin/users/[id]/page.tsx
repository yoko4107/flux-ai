"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft, Mail, Phone, Building2, Shield, CheckCircle2, XCircle,
  CalendarDays, Briefcase, FolderOpen, Globe, HeartHandshake, Link2,
  User as UserIcon, Hash,
} from "lucide-react"

type SocialLink = { platform: string; url: string }
type EmergencyContact = { name: string; phone: string; relation: string }

type UserDetail = {
  id: string
  name: string | null
  email: string
  role: string
  status: string
  department: string | null
  phone: string | null
  emailAliases: { type: string; email: string }[] | null
  hireDate: string | null
  driveFolderId: string | null
  kycVerified: boolean
  createdAt: string
  organization: { id: string; name: string } | null
  manager: { id: string; name: string | null; email: string | null } | null
  costCenter: { id: string; code: string; name: string; currency: string } | null
  profile: {
    jobTitle: string | null
    employmentStartDate: string | null
    employmentEndDate: string | null
    emergencyContact: EmergencyContact | null
    socialLinks: SocialLink[] | null
  } | null
  _count: { requests: number }
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-800",
  SUPER_ADMIN: "bg-red-100 text-red-800",
  APPROVER: "bg-blue-100 text-blue-800",
  FINANCE: "bg-green-100 text-green-800",
  EMPLOYEE: "bg-gray-100 text-gray-700",
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-gray-100 text-gray-500",
  PENDING: "bg-amber-100 text-amber-800",
}

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter / X",
  github: "GitHub",
  instagram: "Instagram",
  other: "Website",
}

function fmt(date: string | null) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

function initials(name: string | null, email: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "User not found" : "Failed to load user")
        return r.json()
      })
      .then(setUser)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-40 bg-gray-200 rounded-xl" />
        <div className="h-32 bg-gray-200 rounded-xl" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="max-w-3xl mx-auto text-center py-24 space-y-4">
        <p className="text-gray-500">{error ?? "User not found"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Go back
        </Button>
      </div>
    )
  }

  const socials = (user.profile?.socialLinks ?? []).filter((s) => s.url.trim())

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Identity card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5">
            <Avatar className="h-16 w-16 text-lg">
              <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold">{user.name ?? "—"}</h1>
                <Badge className={ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"}>
                  {user.role.replace("_", " ")}
                </Badge>
                <Badge className={STATUS_COLORS[user.status] ?? "bg-gray-100 text-gray-500"}>
                  {user.status}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </div>
              {user.profile?.jobTitle && (
                <p className="mt-1 text-sm text-gray-600">{user.profile.jobTitle}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-400">Requests</p>
              <p className="text-2xl font-bold text-gray-800">{user._count.requests}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Building2 className="h-3 w-3" /> Organization</p>
              <p className="font-medium">{user.organization?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Hash className="h-3 w-3" /> Cost center</p>
              <p className="font-medium">{user.costCenter ? `${user.costCenter.code} · ${user.costCenter.name}` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><UserIcon className="h-3 w-3" /> Manager</p>
              <p className="font-medium">{user.manager?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Briefcase className="h-3 w-3" /> Department</p>
              <p className="font-medium">{user.department ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Hired</p>
              <p className="font-medium">{fmt(user.hireDate)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Shield className="h-3 w-3" /> KYC</p>
              <p className="font-medium flex items-center gap-1">
                {user.kycVerified
                  ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Verified</>
                  : <><XCircle className="h-3.5 w-3.5 text-gray-400" /> Not verified</>}
              </p>
            </div>
          </div>

          {/* Social links */}
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socials.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 border rounded-full px-3 py-1 hover:bg-gray-50"
                >
                  <Globe className="h-3 w-3" />
                  {PLATFORM_LABELS[s.platform] ?? s.platform}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-gray-500" /> Employment
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">Start date</p>
            <p className="font-medium">{fmt(user.profile?.employmentStartDate ?? null)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">End date</p>
            <p className="font-medium">{fmt(user.profile?.employmentEndDate ?? null)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Member since</p>
            <p className="font-medium">{fmt(user.createdAt)}</p>
          </div>
          {user.driveFolderId && (
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Drive folder</p>
              <a
                href={`https://drive.google.com/drive/folders/${user.driveFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                Open folder
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-500" /> Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <p className="font-medium">{user.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Email aliases</p>
              {(user.emailAliases as { type: string; email: string }[] | null)?.length
                ? (user.emailAliases as { type: string; email: string }[]).map((a, i) => (
                    <p key={i} className="font-medium">{a.email} <span className="text-gray-400 text-xs">({a.type})</span></p>
                  ))
                : <p className="font-medium">—</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency contact */}
      {user.profile?.emergencyContact && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HeartHandshake className="h-4 w-4 text-rose-500" /> Emergency contact
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">Name</p>
              <p className="font-medium">{user.profile.emergencyContact.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Relationship</p>
              <p className="font-medium">{user.profile.emergencyContact.relation}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Phone</p>
              <p className="font-medium">{user.profile.emergencyContact.phone}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Professional links */}
      {socials.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-gray-500" /> Professional links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {socials.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <Globe className="h-4 w-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">{PLATFORM_LABELS[s.platform] ?? s.platform}</p>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline truncate block"
                  >
                    {s.url}
                  </a>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
