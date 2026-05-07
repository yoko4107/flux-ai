/**
 * Outlook / Microsoft 365 calendar adapter.
 *
 * Talks directly to Microsoft Graph (https://graph.microsoft.com/v1.0)
 * via fetch — no SDK dependency. OAuth token bundle is stored as the
 * raw token-endpoint response under encryptedToken; refresh is done
 * lazily when the access token is < 60s from expiry.
 */

import { prisma } from "@/lib/prisma"
import { encryptToken, decryptToken } from "../encrypt"
import type { CalendarAdapter, CalendarEventInput } from "../types"

const GRAPH = "https://graph.microsoft.com/v1.0"
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

export const OUTLOOK_SCOPES = ["Calendars.ReadWrite", "offline_access", "openid", "email"]

interface StoredBundle {
  access_token: string
  refresh_token?: string
  expires_at: number // ms epoch — we compute this; Graph returns expires_in seconds
  token_type?: string
  scope?: string
}

export function makeOutlookAuthUrl(state: string): string {
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  if (!clientId) throw new Error("OUTLOOK_CLIENT_ID not configured")
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${base}/api/auth/calendar/outlook/callback`,
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
    prompt: "consent",
  })
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeOutlookCode(code: string): Promise<StoredBundle & { id_token?: string }> {
  const clientId = process.env.OUTLOOK_CLIENT_ID
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  if (!clientId || !clientSecret) throw new Error("OUTLOOK_CLIENT_ID / _SECRET not configured")
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: `${base}/api/auth/calendar/outlook/callback`,
    grant_type: "authorization_code",
    scope: OUTLOOK_SCOPES.join(" "),
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Outlook token exchange failed: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type?: string
    scope?: string
    id_token?: string
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
    id_token: data.id_token,
  }
}

export class OutlookCalendarAdapter implements CalendarAdapter {
  readonly providerName = "Outlook / Microsoft 365"
  private bundle: StoredBundle | null = null

  constructor(private readonly tokenRowId: string) {}

  private async load(): Promise<StoredBundle> {
    if (this.bundle) return this.bundle
    const row = await prisma.calendarToken.findUnique({ where: { id: this.tokenRowId } })
    if (!row) throw new Error("Calendar token row missing")
    this.bundle = JSON.parse(decryptToken(row.encryptedToken)) as StoredBundle
    return this.bundle
  }

  async ensureFreshToken(): Promise<void> {
    const bundle = await this.load()
    if (bundle.expires_at - Date.now() > 60_000) return
    if (!bundle.refresh_token) {
      throw new Error("No refresh token; user must reconnect Outlook")
    }
    const clientId = process.env.OUTLOOK_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET
    if (!clientId || !clientSecret) throw new Error("OUTLOOK_CLIENT_ID / _SECRET not configured")

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: bundle.refresh_token,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES.join(" "),
    })
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Outlook refresh failed: ${res.status}`)
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    const merged: StoredBundle = {
      ...bundle,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? bundle.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    }
    await prisma.calendarToken.update({
      where: { id: this.tokenRowId },
      data: {
        encryptedToken: encryptToken(JSON.stringify(merged)),
        tokenExpiry: new Date(merged.expires_at),
      },
    })
    this.bundle = merged
  }

  async createEvent(event: CalendarEventInput): Promise<string> {
    const bundle = await this.load()
    // Graph requires ISO datetimes with explicit timeZone. UTC keeps it
    // unambiguous regardless of the user's mailbox timezone.
    const body = {
      subject: event.title,
      body: { contentType: "Text", content: event.description ?? "" },
      start: { dateTime: event.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: event.end.toISOString(), timeZone: "UTC" },
      isAllDay: event.allDay,
      transactionId: event.uid, // dedupe key, max 128 chars; Graph accepts any string
      attendees: (event.attendees ?? []).map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: "optional",
      })),
    }
    const res = await fetch(`${GRAPH}/me/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bundle.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Outlook createEvent failed: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { id: string }
    await prisma.calendarToken.update({
      where: { id: this.tokenRowId },
      data: { lastSyncedAt: new Date() },
    })
    return data.id
  }

  async deleteEvent(eventId: string): Promise<void> {
    const bundle = await this.load()
    const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${bundle.access_token}` },
    })
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Outlook deleteEvent failed: ${res.status}`)
    }
  }
}
