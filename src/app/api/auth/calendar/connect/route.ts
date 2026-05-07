import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateToken } from "@/lib/email-tokens"
import { makeGoogleOAuth2Client, GOOGLE_SCOPES } from "@/lib/calendar/adapters/google"
import { makeOutlookAuthUrl } from "@/lib/calendar/adapters/outlook"
import { makeLarkAuthUrl } from "@/lib/calendar/adapters/lark"

// GET /api/auth/calendar/connect?provider=GOOGLE|OUTLOOK|LARK
//   Redirects the user to the provider's OAuth consent screen.
//   Signed `state` (15-min TTL) carries userId so the callback doesn't
//   need to trust the session cookie across the cross-domain redirect.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const provider = new URL(req.url).searchParams.get("provider")?.toUpperCase()
  if (!provider || !["GOOGLE", "OUTLOOK", "LARK"].includes(provider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
  }

  const state = generateToken({
    action: "CALENDAR_FEED",
    resourceId: "oauth-state",
    resourceType: "LEAVE",
    userId: session.user.id,
    expiresAt: Date.now() + 15 * 60 * 1000,
  })

  if (provider === "GOOGLE") {
    const oauth = makeGoogleOAuth2Client()
    const url = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPES,
      state,
      include_granted_scopes: true,
    })
    return NextResponse.redirect(url)
  }

  if (provider === "OUTLOOK") {
    return NextResponse.redirect(makeOutlookAuthUrl(state))
  }
  // LARK
  return NextResponse.redirect(makeLarkAuthUrl(state))
}
