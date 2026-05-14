import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/email-tokens"
import { encryptToken } from "@/lib/calendar/encrypt"
import { exchangeLarkCode } from "@/lib/calendar/adapters/lark"

// GET /api/auth/calendar/lark/callback?code=...&state=...
// Exchanges the auth code for an access/refresh bundle and persists it.

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
    bundle = await exchangeLarkCode(code)
  } catch {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=token_failed"))
  }

  // Lark doesn't return an email in the token response; the open_id is the
  // stable user identifier. We could resolve email via /authen/v1/user_info
  // but that's an extra round-trip; skip it for now.
  const encrypted = encryptToken(JSON.stringify(bundle))
  try {
    await prisma.calendarToken.upsert({
      where: { userId_provider: { userId, provider: "LARK" } },
      create: {
        userId,
        provider: "LARK",
        accountEmail: bundle.open_id,
        encryptedToken: encrypted,
        tokenExpiry: new Date(bundle.expires_at),
        isActive: true,
      },
      update: {
        accountEmail: bundle.open_id,
        encryptedToken: encrypted,
        tokenExpiry: new Date(bundle.expires_at),
        isActive: true,
        connectedAt: new Date(),
      },
    })
    await prisma.userProfile.upsert({
      where: { userId },
      update: { calendarProvider: "LARK" },
      create: { userId, calendarProvider: "LARK" },
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
