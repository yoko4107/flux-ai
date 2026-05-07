"use client"

import { useEffect, useState } from "react"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"

// User profile preferences page (Leave & Calendar module).
// Reachable from the avatar dropdown. Mirrors the onboarding wizard's
// settings — locale, calendar, notifications — and is always editable.

type Profile = {
  countryCode: string
  timezone: string
  defaultCurrency: string
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
  weekStartsOn: 0 | 1
  jobTitle: string | null
  phone: string | null
  calendarProvider: "NONE" | "GOOGLE" | "LARK" | "OUTLOOK" | "APPLE_ICS"
  emailActionsEnabled: boolean
  notifyOnLeaveStatus: boolean
  notifyOnProposal: boolean
  notifyBeforeLeave: string | null
  notifyInApp: boolean
}

const COUNTRIES = [
  { code: "ID", name: "Indonesia" },
  { code: "VN", name: "Vietnam" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "PH", name: "Philippines" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IN", name: "India" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
]

const CURRENCIES = ["IDR","VND","USD","SGD","MYR","THB","PHP","JPY","EUR","GBP","AUD","CNY","INR","HKD","KRW","TWD"]

const TIMEZONES = [
  "Asia/Jakarta","Asia/Ho_Chi_Minh","Asia/Singapore","Asia/Kuala_Lumpur",
  "Asia/Bangkok","Asia/Manila","Asia/Tokyo","Asia/Seoul","Asia/Hong_Kong",
  "Asia/Taipei","Asia/Kolkata","Australia/Sydney","Europe/London",
  "Europe/Berlin","America/New_York","America/Los_Angeles","UTC",
]

export default function ProfilePreferencesPage() {
  const [p, setP] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/profile/preferences")
      .then((r) => r.json())
      .then((data) => setP(data.profile))
  }, [])

  async function save() {
    if (!p) return
    setBusy(true); setSaved(false)
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      })
      if (res.ok) setSaved(true)
    } finally {
      setBusy(false)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (!p) return <div className="p-8 text-sm text-gray-500">Loading…</div>

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile & Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">Locale, calendar provider, and notification choices.</p>
      </div>

      <CalendarStatusBanner />


      <Section title="Locale">
        <Field label="Country">
          <select value={p.countryCode} onChange={(e) => setP({ ...p, countryCode: e.target.value })} className={inputCls}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Timezone">
          <select value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })} className={inputCls}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="Default currency">
          <select value={p.defaultCurrency} onChange={(e) => setP({ ...p, defaultCurrency: e.target.value })} className={inputCls}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Date format">
          <select value={p.dateFormat} onChange={(e) => setP({ ...p, dateFormat: e.target.value as Profile["dateFormat"] })} className={inputCls}>
            <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
          </select>
        </Field>
        <Field label="First day of week">
          <select value={p.weekStartsOn} onChange={(e) => setP({ ...p, weekStartsOn: Number(e.target.value) as 0 | 1 })} className={inputCls}>
            <option value={1}>Monday</option><option value={0}>Sunday</option>
          </select>
        </Field>
      </Section>

      <Section title="Personal">
        <Field label="Job title">
          <input value={p.jobTitle ?? ""} onChange={(e) => setP({ ...p, jobTitle: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Phone">
          <input value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} className={inputCls} />
        </Field>
      </Section>

      <Section title="Calendar integration">
        <CalendarConnection
          current={p.calendarProvider}
          onChanged={(provider) => setP({ ...p, calendarProvider: provider })}
        />
      </Section>

      <Section title="Notifications">
        <Toggle label="Allow approve / reject from email" value={p.emailActionsEnabled} onChange={(v) => setP({ ...p, emailActionsEnabled: v })} />
        <Toggle label="Notify me on leave status changes" value={p.notifyOnLeaveStatus} onChange={(v) => setP({ ...p, notifyOnLeaveStatus: v })} />
        <Toggle label="Notify me on date proposals & counters" value={p.notifyOnProposal} onChange={(v) => setP({ ...p, notifyOnProposal: v })} />
        <Toggle label="In-app notifications" value={p.notifyInApp} onChange={(v) => setP({ ...p, notifyInApp: v })} />
        <Field label="Reminder before my leave starts">
          <select value={p.notifyBeforeLeave ?? ""} onChange={(e) => setP({ ...p, notifyBeforeLeave: e.target.value || null })} className={inputCls}>
            <option value="1d">1 day before</option>
            <option value="1h">1 hour before</option>
            <option value="">No reminder</option>
          </select>
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#0B1E3F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  )
}

const inputCls = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  )
}

function CalendarStatusBanner() {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const status = params.get("calendar")
    if (!status) return
    const messages: Record<string, { kind: "ok" | "error"; text: string }> = {
      connected: { kind: "ok", text: "Calendar connected. Future approved leaves will be pushed automatically." },
      denied: { kind: "error", text: "You denied access. Nothing was changed." },
      invalid: { kind: "error", text: "The OAuth callback was malformed. Please try again." },
      expired: { kind: "error", text: "The OAuth link expired before you finished. Please try again." },
      token_failed: { kind: "error", text: "Couldn't exchange the OAuth code. Please retry, or contact support if it persists." },
    }
    const m = messages[status]
    if (m) {
      setMsg(m)
      // Strip the query so refreshes don't re-show the banner.
      const url = new URL(window.location.href)
      url.searchParams.delete("calendar")
      window.history.replaceState({}, "", url.toString())
    }
  }, [])
  if (!msg) return null
  const Icon = msg.kind === "ok" ? CheckCircle2 : AlertCircle
  const tone = msg.kind === "ok" ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tone}`}>
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{msg.text}</span>
    </div>
  )
}

function CalendarConnection({ current, onChanged }: { current: Profile["calendarProvider"]; onChanged: (p: Profile["calendarProvider"]) => void }) {
  const connected = current !== "NONE"
  async function disconnect() {
    if (!confirm(`Disconnect ${current}? Future leaves won't be pushed to your calendar (you'll still get the .ics email attachment).`)) return
    await fetch(`/api/auth/calendar/disconnect?provider=${current}`, { method: "DELETE" })
    onChanged("NONE")
  }
  function connect(provider: "GOOGLE" | "OUTLOOK" | "LARK") {
    window.location.href = `/api/auth/calendar/connect?provider=${provider}`
  }
  return (
    <div className="col-span-2 space-y-3">
      <ProviderRow
        icon="🗓"
        title="Google Calendar"
        active={current === "GOOGLE"}
        onConnect={() => connect("GOOGLE")}
        onDisconnect={disconnect}
      />
      <ProviderRow
        icon="📅"
        title="Outlook / M365"
        active={current === "OUTLOOK"}
        onConnect={() => connect("OUTLOOK")}
        onDisconnect={disconnect}
      />
      <ProviderRow
        icon="🪁"
        title="Lark / Feishu Calendar"
        active={current === "LARK"}
        onConnect={() => connect("LARK")}
        onDisconnect={disconnect}
      />

      {!connected && (
        <p className="text-xs text-gray-500">
          Approved leaves always include an .ics attachment in the email regardless of which provider is connected.
        </p>
      )}
    </div>
  )
}

function ProviderRow({ icon, title, active, onConnect, onDisconnect }: { icon: string; title: string; active: boolean; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-sm font-medium text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">
            {active ? "Connected — approved leaves are pushed automatically" : "Not connected"}
          </div>
        </div>
      </div>
      {active ? (
        <button onClick={onDisconnect} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
          Disconnect
        </button>
      ) : (
        <button onClick={onConnect} className="rounded-lg bg-[#0B1E3F] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0B1E3F]/90">
          Connect
        </button>
      )}
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 col-span-2">
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
