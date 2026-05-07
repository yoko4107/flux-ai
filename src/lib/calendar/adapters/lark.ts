/**
 * Lark / Feishu Calendar adapter.
 *
 * Lark's Open Platform splits into two regions:
 *   - International: open.larksuite.com (default)
 *   - China:         open.feishu.cn (set LARK_DOMAIN=open.feishu.cn)
 *
 * OAuth flow is the standard authorization-code grant. Calendar APIs
 * are at /open-apis/calendar/v4/. Events use Unix timestamps as strings
 * (`{timestamp: "1714896000"}`), not ISO 8601.
 *
 * Token bundle stored as JSON includes the user's primary calendar_id
 * resolved on first use so we don't fetch it on every event create.
 */

import { prisma } from "@/lib/prisma"
import { encryptToken, decryptToken } from "../encrypt"
import type { CalendarAdapter, CalendarEventInput } from "../types"

const DEFAULT_DOMAIN = "open.larksuite.com"
function domain(): string {
  return (process.env.LARK_DOMAIN || DEFAULT_DOMAIN).replace(/^https?:\/\//, "").replace(/\/$/, "")
}
function api(path: string): string {
  return `https://${domain()}${path}`
}

interface StoredBundle {
  access_token: string
  refresh_token?: string
  expires_at: number // ms epoch
  refresh_expires_at?: number
  open_id?: string
  primary_calendar_id?: string // resolved lazily
}

export function makeLarkAuthUrl(state: string): string {
  const appId = process.env.LARK_APP_ID
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  if (!appId) throw new Error("LARK_APP_ID not configured")
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: `${base}/api/auth/calendar/lark/callback`,
    state,
  })
  return `https://${domain()}/open-apis/authen/v1/authorize?${params.toString()}`
}

export async function exchangeLarkCode(code: string): Promise<StoredBundle> {
  const appId = process.env.LARK_APP_ID
  const appSecret = process.env.LARK_APP_SECRET
  if (!appId || !appSecret) throw new Error("LARK_APP_ID / _SECRET not configured")
  const res = await fetch(api("/open-apis/authen/v1/access_token"), {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
      code,
      grant_type: "authorization_code",
    }),
  })
  if (!res.ok) throw new Error(`Lark token exchange failed: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as {
    code: number
    msg?: string
    data?: {
      access_token: string
      refresh_token?: string
      expires_in: number
      refresh_expires_in?: number
      open_id?: string
    }
  }
  if (json.code !== 0 || !json.data) {
    throw new Error(`Lark token exchange returned code=${json.code} msg=${json.msg ?? "unknown"}`)
  }
  const d = json.data
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: Date.now() + d.expires_in * 1000,
    refresh_expires_at: d.refresh_expires_in ? Date.now() + d.refresh_expires_in * 1000 : undefined,
    open_id: d.open_id,
  }
}

export class LarkCalendarAdapter implements CalendarAdapter {
  readonly providerName = "Lark Calendar"
  private bundle: StoredBundle | null = null

  constructor(private readonly tokenRowId: string) {}

  private async load(): Promise<StoredBundle> {
    if (this.bundle) return this.bundle
    const row = await prisma.calendarToken.findUnique({ where: { id: this.tokenRowId } })
    if (!row) throw new Error("Calendar token row missing")
    this.bundle = JSON.parse(decryptToken(row.encryptedToken)) as StoredBundle
    return this.bundle
  }

  private async persist(bundle: StoredBundle): Promise<void> {
    await prisma.calendarToken.update({
      where: { id: this.tokenRowId },
      data: {
        encryptedToken: encryptToken(JSON.stringify(bundle)),
        tokenExpiry: new Date(bundle.expires_at),
        lastSyncedAt: new Date(),
      },
    })
    this.bundle = bundle
  }

  async ensureFreshToken(): Promise<void> {
    const bundle = await this.load()
    if (bundle.expires_at - Date.now() > 60_000) return
    if (!bundle.refresh_token) throw new Error("No refresh token; user must reconnect Lark")
    const appId = process.env.LARK_APP_ID
    const appSecret = process.env.LARK_APP_SECRET
    if (!appId || !appSecret) throw new Error("LARK_APP_ID / _SECRET not configured")

    const res = await fetch(api("/open-apis/authen/v1/refresh_access_token"), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
        refresh_token: bundle.refresh_token,
        grant_type: "refresh_token",
      }),
    })
    if (!res.ok) throw new Error(`Lark refresh failed: ${res.status}`)
    const json = (await res.json()) as {
      code: number
      msg?: string
      data?: { access_token: string; refresh_token?: string; expires_in: number; refresh_expires_in?: number }
    }
    if (json.code !== 0 || !json.data) throw new Error(`Lark refresh code=${json.code} msg=${json.msg}`)
    await this.persist({
      ...bundle,
      access_token: json.data.access_token,
      refresh_token: json.data.refresh_token ?? bundle.refresh_token,
      expires_at: Date.now() + json.data.expires_in * 1000,
      refresh_expires_at: json.data.refresh_expires_in ? Date.now() + json.data.refresh_expires_in * 1000 : bundle.refresh_expires_at,
    })
  }

  /**
   * Lark requires a calendar_id for event CRUD. Resolve the user's primary
   * calendar once and cache it on the stored bundle.
   */
  private async primaryCalendarId(): Promise<string> {
    const bundle = await this.load()
    if (bundle.primary_calendar_id) return bundle.primary_calendar_id
    const res = await fetch(api("/open-apis/calendar/v4/calendars/primary"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: "{}",
    })
    if (!res.ok) throw new Error(`Lark primary-calendar lookup failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as {
      code: number
      data?: { calendars?: { calendar?: { calendar_id?: string } }[] }
    }
    if (json.code !== 0) throw new Error(`Lark primary calendar code=${json.code}`)
    const id = json.data?.calendars?.[0]?.calendar?.calendar_id
    if (!id) throw new Error("Lark returned no primary calendar id")
    await this.persist({ ...bundle, primary_calendar_id: id })
    return id
  }

  async createEvent(event: CalendarEventInput): Promise<string> {
    const bundle = await this.load()
    const calendarId = await this.primaryCalendarId()
    // Lark uses string-encoded Unix timestamps (seconds).
    const startTs = Math.floor(event.start.getTime() / 1000).toString()
    const endTs = Math.floor(event.end.getTime() / 1000).toString()
    const body = {
      summary: event.title,
      description: event.description ?? "",
      start_time: { timestamp: startTs, timezone: "UTC" },
      end_time: { timestamp: endTs, timezone: "UTC" },
      // Lark doesn't have an explicit "all day" flag in v4 — full-day events
      // are represented by start/end aligned to midnight UTC, which we already
      // produce in the leave flow.
      visibility: "default",
    }
    const res = await fetch(api(`/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Lark createEvent failed: ${res.status} ${await res.text()}`)
    const json = (await res.json()) as { code: number; msg?: string; data?: { event?: { event_id?: string } } }
    if (json.code !== 0) throw new Error(`Lark createEvent code=${json.code} msg=${json.msg}`)
    const eventId = json.data?.event?.event_id
    if (!eventId) throw new Error("Lark createEvent returned no event_id")
    return eventId
  }

  async deleteEvent(eventId: string): Promise<void> {
    const bundle = await this.load()
    const calendarId = await this.primaryCalendarId()
    const res = await fetch(api(`/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bundle.access_token}` },
    })
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Lark deleteEvent failed: ${res.status}`)
    }
  }
}
