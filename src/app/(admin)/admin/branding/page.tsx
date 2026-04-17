"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Upload, Building2, Loader2, Trash2 } from "lucide-react"

interface Organization {
  id: string
  name: string
  slug: string
  industry: string | null
  logoUrl: string | null
}

export default function AdminBrandingPage() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [name, setName] = useState("")
  const [industry, setIndustry] = useState("")
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/organization")
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to load organization")
      }
      const { organization } = await res.json()
      setOrg(organization)
      setName(organization.name ?? "")
      setIndustry(organization.industry ?? "")
      setLogoUrl(organization.logoUrl ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load organization")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      setLogoUrl(data.url)
      toast.success("Logo uploaded — remember to save.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/organization", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || org?.name,
          industry: industry.trim() || null,
          logoUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      setOrg(data.organization)
      toast.success("Branding updated.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function clearLogo() {
    setLogoUrl(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading organization…
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0B1E3F]">Organization Branding</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload your company logo and set the display name shown to your team.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry (optional)</Label>
            <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={org?.slug ?? ""} disabled />
            <p className="text-xs text-gray-500">Slug is set at organization creation and cannot be changed here.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-5">
            <div className="h-20 w-20 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-8 w-8 text-gray-400" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Upload logo</>
                  )}
                </Button>
                {logoUrl && (
                  <Button type="button" variant="ghost" onClick={clearLogo}>
                    <Trash2 className="h-4 w-4 mr-2" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500">PNG, JPEG, WebP, or SVG. Max 2 MB. Square works best.</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving || uploading} className="bg-[#0B1E3F] hover:bg-[#0B1E3F]/90">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save changes"}
        </Button>
        <Button variant="outline" onClick={load} disabled={saving || uploading}>Reset</Button>
      </div>

      <PreviewCard name={name || org?.name || "Your Company"} logoUrl={logoUrl} />
    </div>
  )
}

function PreviewCard({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  return (
    <Card className="bg-[#0B1E3F] text-white">
      <CardContent className="py-6 flex items-center gap-4">
        <div className="h-12 w-12 rounded-md bg-white/10 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={name} className="h-full w-full object-contain" />
          ) : (
            <Building2 className="h-6 w-6 text-cyan-300" />
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Sidebar preview</p>
          <p className="text-lg font-semibold">{name}</p>
        </div>
      </CardContent>
    </Card>
  )
}
