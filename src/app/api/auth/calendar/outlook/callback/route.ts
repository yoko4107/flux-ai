import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/email-tokens"
import { encryptToken } from "@/lib/calendar/encrypt"
import { exchangeOutlookCode } from "@/lib/calendar/adapters/outlook"

// GET /api/auth/calendar/outlook/callback?code=...&state=...
// Mirrors the Google callback. Stores the bundle as JSON under
// CalendarToken.encryptedToken; flips UserProfile.calendarProvider to
// OUTLOOK; redirects back to /profile/preferences with a status param.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  if (errorParam) return NextResponse.redirect(absolute("/profile/preferences?calendar=denied"))
  if (!code || !state) return NextResponse.redirect(absolute("/profile/preferences?calendar=invalid"))

  const decoded = verifyToken(state)
  if (!decoded || decoded.resourceId !== "oauth-state") {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=expired"))
  }
  const userId = decoded.userId

  let bundle
  try {
    bundle = await exchangeOutlookCode(code)
  } catch {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=token_failed"))
  }

  // Pull the email out of the id_token if present so the UI can show it.
  let accountEmail: string | undefined
  try {
    if (bundle.id_token) {
      const payload = JSON.parse(
        Buffer.from(bundle.id_token.split(".")[1], "base64").toString("utf8")
      ) as { email?: string; preferred_username?: string }
      accountEmail = payload.email ?? payload.preferred_username
    }
  } catch { /* non-fatal */ }

  // Strip id_token before persisting — we only need the access/refresh pair.
  const { id_token: _omit, ...storable } = bundle
  void _omit

  const encrypted = encryptToken(JSON.stringify(storable))
  try {
    await prisma.calendarToken.upsert({
      where: { userId_provider: { userId, provider: "OUTLOOK" } },
      create: {
        userId,
        provider: "OUTLOOK",
        accountEmail,
        encryptedToken: encrypted,
        tokenExpiry: new Date(storable.expires_at),
        isActive: true,
      },
      update: {
        accountEmail,
        encryptedToken: encrypted,
        tokenExpiry: new Date(storable.expires_at),
        isActive: true,
        connectedAt: new Date(),
      },
    })
    await prisma.userProfile.upsert({
      where: { userId },
      update: { calendarProvider: "OUTLOOK" },
      create: { userId, calendarProvider: "OUTLOOK" },
    })
  } catch {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=save_failed"))
  }

  return NextResponse.redirect(absolute("/profile/preferences?calendar=connected"))
}

function absolute(path: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  return `${base}${path}`
}
