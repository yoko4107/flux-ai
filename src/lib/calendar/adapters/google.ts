/**
 * Google Calendar adapter — pushes leave events into the user's primary
 * calendar. Uses the official `googleapis` SDK already in deps.
 *
 * Token lifecycle:
 *   - On OAuth callback we receive { access_token, refresh_token, expiry_date }
 *     and store them as ONE encrypted JSON blob in CalendarToken.encryptedToken.
 *   - On every request we lazy-decrypt, hand the bundle to the OAuth2 client,
 *     and let the SDK refresh if needed. If the SDK gives us back a new
 *     access token we re-encrypt and persist.
 */

import { google, calendar_v3 } from "googleapis"
import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/prisma"
import { encryptToken, decryptToken } from "../encrypt"
import type { CalendarAdapter, CalendarEventInput } from "../types"

interface StoredBundle {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  scope?: string
  token_type?: string | null
  id_token?: string | null
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
]

export function makeGoogleOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CALENDAR_CLIENT_ID / _CLIENT_SECRET not configured")
  }
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${base}/api/auth/calendar/google/callback`
  )
}

export class GoogleCalendarAdapter implements CalendarAdapter {
  readonly providerName = "Google Calendar"
  private bundle: StoredBundle | null = null
  private oauth: OAuth2Client | null = null

  constructor(private readonly tokenRowId: string) {}

  private async load(): Promise<{ bundle: StoredBundle; oauth: OAuth2Client }> {
    if (this.bundle && this.oauth) return { bundle: this.bundle, oauth: this.oauth }
    const row = await prisma.calendarToken.findUnique({ where: { id: this.tokenRowId } })
    if (!row) throw new Error("Calendar token row missing")
    const decrypted = JSON.parse(decryptToken(row.encryptedToken)) as StoredBundle
    const oauth = makeGoogleOAuth2Client()
    oauth.setCredentials(decrypted)
    this.bundle = decrypted
    this.oauth = oauth
    return { bundle: decrypted, oauth }
  }

  /**
   * Refresh the access token if it's expired; persist the new bundle.
   * The SDK fires a `tokens` event when it auto-refreshes, but we also
   * support an explicit force-refresh so callers can do it eagerly.
   */
  async ensureFreshToken(): Promise<void> {
    const { bundle, oauth } = await this.load()
    const now = Date.now()
    const expiresSoon = !bundle.expiry_date || bundle.expiry_date - now < 60_000
    if (!expiresSoon) return

    if (!bundle.refresh_token) {
      // Without a refresh token we can't refresh — the user has to reconnect.
      throw new Error("No refresh token; user must reconnect Google Calendar")
    }
    const { credentials } = await oauth.refreshAccessToken()
    const merged: StoredBundle = { ...bundle, ...credentials }
    await prisma.calendarToken.update({
      where: { id: this.tokenRowId },
      data: {
        encryptedToken: encryptToken(JSON.stringify(merged)),
        tokenExpiry: merged.expiry_date ? new Date(merged.expiry_date) : null,
      },
    })
    this.bundle = merged
  }

  async createEvent(event: CalendarEventInput): Promise<string> {
    const { oauth } = await this.load()
    const calendar = google.calendar({ version: "v3", auth: oauth })

    // Build provider event payload. Full-day → use `date`; timed → `dateTime`.
    const evt: calendar_v3.Schema$Event = {
      summary: event.title,
      description: event.description,
      location: event.location,
      iCalUID: event.uid, // helps Google dedupe across re-creates
      ...(event.allDay
        ? {
            // RFC-5545 exclusive-end convention is honoured by Google as well.
            start: { date: ymd(event.start) },
            end: { date: ymd(event.end) },
          }
        : {
            start: { dateTime: event.start.toISOString() },
            end: { dateTime: event.end.toISOString() },
          }),
      ...(event.attendees && event.attendees.length > 0
        ? { attendees: event.attendees.map((a) => ({ email: a.email, displayName: a.name })) }
        : {}),
    }

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: evt,
      // Don't email attendees — our own email is the source of truth.
      sendUpdates: "none",
    })
    if (!res.data.id) throw new Error("Google API returned no event id")
    await prisma.calendarToken.update({
      where: { id: this.tokenRowId },
      data: { lastSyncedAt: new Date() },
    })
    return res.data.id
  }

  async deleteEvent(eventId: string): Promise<void> {
    const { oauth } = await this.load()
    const calendar = google.calendar({ version: "v3", auth: oauth })
    try {
      await calendar.events.delete({ calendarId: "primary", eventId, sendUpdates: "none" })
    } catch (err) {
      // 404 = already deleted; ignore
      const e = err as { code?: number; status?: number; response?: { status?: number } }
      const status = e.code ?? e.status ?? e.response?.status
      if (status !== 404 && status !== 410) throw err
    }
  }
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  const day = String(d.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
