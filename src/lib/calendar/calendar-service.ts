/**
 * CalendarService.forUser(userId) returns the adapter for whatever
 * calendar provider the user has connected (via /api/auth/calendar/*).
 * Returns null when no provider is connected — callers fall back to the
 * .ics-attachment path.
 */

import { prisma } from "@/lib/prisma"
import type { CalendarAdapter } from "./types"
import { GoogleCalendarAdapter } from "./adapters/google"
import { OutlookCalendarAdapter } from "./adapters/outlook"
import { LarkCalendarAdapter } from "./adapters/lark"

export class CalendarService {
  /**
   * Resolve an adapter for the given user. Returns null if the user has
   * no active CalendarToken row, or if the provider is one we haven't
   * implemented yet.
   */
  static async forUser(userId: string): Promise<CalendarAdapter | null> {
    const tokenRow = await prisma.calendarToken.findFirst({
      where: { userId, isActive: true },
      orderBy: { connectedAt: "desc" },
    })
    if (!tokenRow) return null

    switch (tokenRow.provider) {
      case "GOOGLE":
        return new GoogleCalendarAdapter(tokenRow.id)
      case "OUTLOOK":
        return new OutlookCalendarAdapter(tokenRow.id)
      case "LARK":
        return new LarkCalendarAdapter(tokenRow.id)
      // APPLE_ICS uses the .ics subscription URL, not OAuth, so there's
      // nothing to dispatch on the server side.
      case "APPLE_ICS":
      case "NONE":
      default:
        return null
    }
  }

  /**
   * Try to push an event for a user; swallow errors so the caller's
   * primary action (e.g. approving leave) isn't blocked by a calendar
   * outage. Returns the provider event id on success, null otherwise.
   */
  static async createEventBestEffort(
    userId: string,
    event: Parameters<CalendarAdapter["createEvent"]>[0]
  ): Promise<string | null> {
    try {
      const adapter = await this.forUser(userId)
      if (!adapter) return null
      await adapter.ensureFreshToken()
      return await adapter.createEvent(event)
    } catch (err) {
      console.warn(`[calendar] createEvent failed for user ${userId}:`, err)
      return null
    }
  }

  /** Best-effort delete; swallows everything. */
  static async deleteEventBestEffort(userId: string, eventId: string): Promise<void> {
    try {
      const adapter = await this.forUser(userId)
      if (!adapter) return
      await adapter.ensureFreshToken()
      await adapter.deleteEvent(eventId)
    } catch (err) {
      console.warn(`[calendar] deleteEvent failed for user ${userId}:`, err)
    }
  }
}
