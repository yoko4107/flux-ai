import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { makeDriveOAuth2Client, saveOrgDriveToken, ensureOrgRootFolder } from "@/lib/google-drive"

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"

  if (error || !code) {
    return NextResponse.redirect(`${base}/admin/cost-centers?driveError=access_denied`)
  }

  const orgId = session.user.organizationId
  if (!orgId) {
    return NextResponse.redirect(`${base}/admin/cost-centers?driveError=no_org`)
  }

  try {
    const oauth = makeDriveOAuth2Client()
    const { tokens } = await oauth.getToken(code)
    await saveOrgDriveToken(orgId, tokens)
    await ensureOrgRootFolder(orgId)
    return NextResponse.redirect(`${base}/admin/cost-centers?driveConnected=1`)
  } catch (err) {
    console.error("Drive callback error:", err)
    return NextResponse.redirect(`${base}/admin/cost-centers?driveError=token_exchange`)
  }
}
