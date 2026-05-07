/**
 * Provider-agnostic shapes for the calendar abstraction. Adapters convert
 * between these and the per-provider event payloads.
 */

export interface CalendarEventInput {
  /** Stable identifier so adapters can upsert / dedupe. */
  uid: string
  title: string
  description?: string
  start: Date
  end: Date
  /** When true, end is exclusive per RFC-5545. */
  allDay: boolean
  location?: string
  /** Best-effort attendees. Adapters may ignore. */
  attendees?: { email: string; name?: string }[]
}

export interface CalendarAdapter {
  /** Human-readable provider name for logging. */
  readonly providerName: string
  /**
   * Upsert an event into the user's primary calendar. Returns the
   * provider-side event id for later updates / deletes.
   */
  createEvent(event: CalendarEventInput): Promise<string>
  /** Best-effort delete. Throws on auth failures, swallows 404s. */
  deleteEvent(eventId: string): Promise<void>
  /**
   * If the access token is short-lived, refresh it lazily and write the
   * refreshed bundle back to the DB. Adapters that don't need this can
   * no-op.
   */
  ensureFreshToken(): Promise<void>
}
