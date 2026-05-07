"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react"

// Onboarding wizard, 4 steps:
//   1. Personal info (name, job title, phone)
//   2. Locale (country, timezone, currency, date format, week start)
//   3. Calendar provider (single choice)
//   4. Notifications
// On finish: POST /api/profile/onboarding/complete and redirect.
//
// New users with isOnboarded=false on their UserProfile are routed here
// by the OnboardingGuard component (separate file).

type Profile = {
  isOnboarded: boolean
  countryCode: string
  timezone: string
  defaultCurrency: string
  dateFormat: string
  weekStartsOn: number
  jobTitle: string | null
  phone: string | null
  calendarProvider: string
  emailActionsEnabled: boolean
  notifyOnLeaveStatus: boolean
  notifyOnProposal: boolean
  notifyBeforeLeave: string | null
  notifyInApp: boolean
}

const COUNTRIES = [
  { code: "ID", name: "Indonesia", tz: "Asia/Jakarta", cur: "IDR" },
  { code: "VN", name: "Vietnam", tz: "Asia/Ho_Chi_Minh", cur: "VND" },
  { code: "SG", name: "Singapore", tz: "Asia/Singapore", cur: "SGD" },
  { code: "MY", name: "Malaysia", tz: "Asia/Kuala_Lumpur", cur: "MYR" },
  { code: "TH", name: "Thailand", tz: "Asia/Bangkok", cur: "THB" },
  { code: "PH", name: "Philippines", tz: "Asia/Manila", cur: "PHP" },
  { code: "US", name: "United States", tz: "America/New_York", cur: "USD" },
  { code: "GB", name: "United Kingdom", tz: "Europe/London", cur: "GBP" },
  { code: "AU", name: "Australia", tz: "Australia/Sydney", cur: "AUD" },
  { code: "JP", name: "Japan", tz: "Asia/Tokyo", cur: "JPY" },
  { code: "KR", name: "South Korea", tz: "Asia/Seoul", cur: "KRW" },
  { code: "IN", name: "India", tz: "Asia/Kolkata", cur: "INR" },
  { code: "HK", name: "Hong Kong", tz: "Asia/Hong_Kong", cur: "HKD" },
  { code: "TW", name: "Taiwan", tz: "Asia/Taipei", cur: "TWD" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [p, setP] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/profile/preferences")
      .then((r) => r.json())
      .then((data) => {
        setP(data.profile)
        // Already onboarded? send them home.
        if (data.profile?.isOnboarded) router.replace("/")
      })
  }, [router])

  if (!p) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>
  }

  async function patch(updates: Partial<Profile>) {
    if (!p) return
    setP({ ...p, ...updates })
    await fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  }

  async function finish() {
    setBusy(true)
    try {
      await fetch("/api/profile/onboarding/complete", { method: "POST" })
      router.replace("/")
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1E3F] via-[#0B1E3F] to-[#1E3A6F] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-[#22D3EE]" : "bg-gray-200"}`} />
          ))}
          <span className="ml-3 text-xs text-gray-500">Step {step} of 4</span>
        </div>

        <div className="p-6 min-h-[360px]">
          {step === 1 && <Step1 profile={p} patch={patch} />}
          {step === 2 && <Step2 profile={p} patch={patch} />}
          {step === 3 && <Step3 profile={p} patch={patch} />}
          {step === 4 && <Step4 profile={p} patch={patch} />}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-30"
          >
            Back
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[#10B981] px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Finish setup
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"

function Step1({ profile, patch }: { profile: Profile; patch: (u: Partial<Profile>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Welcome 👋</h2>
      <p className="text-sm text-gray-600">A few quick questions to set up your workspace.</p>
      <label className="block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Job title</span>
        <input value={profile.jobTitle ?? ""} onChange={(e) => patch({ jobTitle: e.target.value })} className={inputCls} placeholder="e.g. Product Manager" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phone (optional)</span>
        <input value={profile.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} className={inputCls} placeholder="+62 …" />
      </label>
    </div>
  )
}

function Step2({ profile, patch }: { profile: Profile; patch: (u: Partial<Profile>) => void }) {
  function onCountry(code: string) {
    const c = COUNTRIES.find((x) => x.code === code)
    if (!c) return
    patch({ countryCode: c.code, timezone: c.tz, defaultCurrency: c.cur })
  }
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Locale</h2>
      <p className="text-sm text-gray-600">Used for holiday calendars, currencies, and date formatting.</p>
      <label className="block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Country</span>
        <select value={profile.countryCode} onChange={(e) => onCountry(e.target.value)} className={inputCls}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Timezone</span>
          <input value={profile.timezone} onChange={(e) => patch({ timezone: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</span>
          <input value={profile.defaultCurrency} onChange={(e) => patch({ defaultCurrency: e.target.value.toUpperCase() })} maxLength={3} className={inputCls} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date format</span>
          <select value={profile.dateFormat} onChange={(e) => patch({ dateFormat: e.target.value })} className={inputCls}>
            <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Week starts on</span>
          <select value={profile.weekStartsOn} onChange={(e) => patch({ weekStartsOn: Number(e.target.value) })} className={inputCls}>
            <option value={1}>Monday</option><option value={0}>Sunday</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function Step3({ profile, patch }: { profile: Profile; patch: (u: Partial<Profile>) => void }) {
  // Google is the only OAuth provider we ship today; selecting it triggers
  // the OAuth flow inline, which redirects back here on completion.
  function startOAuth(provider: "GOOGLE" | "OUTLOOK" | "LARK") {
    patch({ calendarProvider: provider })
    window.location.href = `/api/auth/calendar/connect?provider=${provider}`
  }
  const options = [
    { code: "NONE", icon: "⏭", title: "Skip for now", desc: "ICS download is always available", enabled: true },
    { code: "APPLE_ICS", icon: "🍎", title: "Apple Calendar", desc: "ICS export — works in Apple Calendar, Outlook, etc.", enabled: true },
    { code: "GOOGLE", icon: "🗓", title: "Google Calendar", desc: "Auto-push approved leaves into your Google Calendar", enabled: true, onSelect: () => startOAuth("GOOGLE") },
    { code: "OUTLOOK", icon: "📅", title: "Outlook / M365", desc: "Auto-push approved leaves into your Outlook calendar", enabled: true, onSelect: () => startOAuth("OUTLOOK") },
    { code: "LARK", icon: "🪁", title: "Lark / Feishu Calendar", desc: "Auto-push approved leaves into your Lark calendar", enabled: true, onSelect: () => startOAuth("LARK") },
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Calendar integration</h2>
      <p className="text-sm text-gray-600">Choose where approved leaves and OT events should land.</p>
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.code}
            disabled={!o.enabled}
            onClick={() => (o.onSelect ? o.onSelect() : patch({ calendarProvider: o.code }))}
            className={`flex items-center gap-3 rounded-xl border p-3 text-left ${
              profile.calendarProvider === o.code
                ? "border-[#0B1E3F] bg-[#0B1E3F]/5"
                : "border-gray-200 hover:bg-gray-50"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-2xl">{o.icon}</span>
            <div className="flex-1">
              <div className="font-medium text-gray-900">{o.title}</div>
              <div className="text-xs text-gray-500">{o.desc}</div>
            </div>
            {profile.calendarProvider === o.code && <CheckCircle2 className="h-5 w-5 text-[#10B981]" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function Step4({ profile, patch }: { profile: Profile; patch: (u: Partial<Profile>) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold text-gray-900">Notifications</h2>
      <p className="text-sm text-gray-600">You can change these any time from your profile.</p>
      <div className="space-y-3">
        <Row label="Email me when leave status changes" value={profile.notifyOnLeaveStatus} onChange={(v) => patch({ notifyOnLeaveStatus: v })} />
        <Row label="Email me when dates are proposed or countered" value={profile.notifyOnProposal} onChange={(v) => patch({ notifyOnProposal: v })} />
        <Row label="Allow me to approve/reject directly from email" value={profile.emailActionsEnabled} onChange={(v) => patch({ emailActionsEnabled: v })} />
        <Row label="In-app notifications" value={profile.notifyInApp} onChange={(v) => patch({ notifyInApp: v })} />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Reminder before my leave starts</span>
        <select value={profile.notifyBeforeLeave ?? ""} onChange={(e) => patch({ notifyBeforeLeave: e.target.value || null })} className={inputCls}>
          <option value="1d">1 day before</option>
          <option value="1h">1 hour before</option>
          <option value="">No reminder</option>
        </select>
      </label>
    </div>
  )
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-[#0B1E3F]" : "bg-gray-300"}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  )
}
