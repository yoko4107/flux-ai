import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/email-tokens"
import { encryptToken } from "@/lib/calendar/encrypt"
import { makeGoogleOAuth2Client } from "@/lib/calendar/adapters/google"

// GET /api/auth/calendar/google/callback?code=...&state=...
//   Completes the OAuth code exchange and persists the token bundle.
//   Verifies state to ensure it was minted by /connect for this user.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  if (errorParam) {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=denied"))
  }
  if (!code || !state) {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=invalid"))
  }
  const decoded = verifyToken(state)
  if (!decoded || decoded.resourceId !== "oauth-state") {
    return NextResponse.redirect(absolute("/profile/preferences?calendar=expired"))
  }
  const userId = decoded.userId

  const oauth = makeGoogleOAuth2Client()
  let tokens
  try {
    const result = await oauth.getToken(code)
    tokens = result.tokens
  } catch (err) {
    console.error("[calendar:google] token exchange failed", err)
    return NextResponse.redirect(absolute("/profile/preferences?calendar=token_failed"))
  }

  // Best-effort: pull the connected account's email so the UI can show it.
  let accountEmail: string | undefined
  try {
    if (tokens.id_token) {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split(".")[1], "base64").toString("utf8")
      ) as { email?: string }
      accountEmail = payload.email
    }
  } catch { /* non-fatal */ }

  const encrypted = encryptToken(JSON.stringify(tokens))
  await prisma.calendarToken.upsert({
    where: { userId_provider: { userId, provider: "GOOGLE" } },
    create: {
      userId,
      provider: "GOOGLE",
      accountEmail,
      encryptedToken: encrypted,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isActive: true,
    },
    update: {
      accountEmail,
      encryptedToken: encrypted,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isActive: true,
      connectedAt: new Date(),
    },
  })

  // Update the user's profile to record the active provider so the UI
  // and the rest of the leave flow know what to use.
  await prisma.userProfile.upsert({
    where: { userId },
    update: { calendarProvider: "GOOGLE" },
    create: { userId, calendarProvider: "GOOGLE" },
  })

  return NextResponse.redirect(absolute("/profile/preferences?calendar=connected"))
}

function absolute(path: string): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  return `${base}${path}`
}
