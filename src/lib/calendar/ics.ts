/**
 * Minimal RFC-5545 .ics builder.
 *
 * We don't need the full spec — just enough to attach a calendar event
 * to leave-approval emails. Recipients can drop the .ics into Apple
 * Calendar, Outlook, Google Calendar, etc.
 */

export interface IcsEvent {
  uid: string
  summary: string
  description?: string
  start: Date
  end: Date
  /** True for all-day events (typical for full-day leave). */
  allDay?: boolean
  organizerEmail?: string
  organizerName?: string
  attendeeEmail?: string
  attendeeName?: string
  location?: string
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatDate(d: Date, allDay: boolean): string {
  const y = d.getUTCFullYear()
  const m = pad(d.getUTCMonth() + 1)
  const day = pad(d.getUTCDate())
  if (allDay) return `${y}${m}${day}`
  const hh = pad(d.getUTCHours())
  const mm = pad(d.getUTCMinutes())
  const ss = pad(d.getUTCSeconds())
  return `${y}${m}${day}T${hh}${mm}${ss}Z`
}

function escape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

export function buildIcs(event: IcsEvent): string {
  const allDay = !!event.allDay
  const dtStart = allDay
    ? `DTSTART;VALUE=DATE:${formatDate(event.start, true)}`
    : `DTSTART:${formatDate(event.start, false)}`
  const dtEnd = allDay
    ? `DTEND;VALUE=DATE:${formatDate(event.end, true)}`
    : `DTEND:${formatDate(event.end, false)}`

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FLUX.AI//Leave//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatDate(new Date(), false)}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escape(event.summary)}`,
  ]
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`)
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`)
  if (event.organizerEmail) {
    const cn = event.organizerName ? `CN=${escape(event.organizerName)}:` : ""
    lines.push(`ORGANIZER;${cn}mailto:${event.organizerEmail}`)
  }
  if (event.attendeeEmail) {
    const cn = event.attendeeName ? `CN=${escape(event.attendeeName)};` : ""
    lines.push(`ATTENDEE;${cn}RSVP=FALSE:mailto:${event.attendeeEmail}`)
  }
  lines.push("STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR")
  return lines.join("\r\n")
}

/** Build the half-day window for AM (08:00-12:00) or PM (13:00-17:00) in UTC. */
export function halfDayWindow(date: Date, period: "AM" | "PM"): { start: Date; end: Date } {
  const startHour = period === "AM" ? 8 : 13
  const endHour = period === "AM" ? 12 : 17
  const start = new Date(date)
  start.setUTCHours(startHour, 0, 0, 0)
  const end = new Date(date)
  end.setUTCHours(endHour, 0, 0, 0)
  return { start, end }
}
