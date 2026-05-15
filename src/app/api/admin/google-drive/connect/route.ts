import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { buildDriveAuthUrl } from "@/lib/google-drive"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const url = buildDriveAuthUrl()
  return NextResponse.redirect(url)
}
