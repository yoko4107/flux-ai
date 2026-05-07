import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// DELETE /api/auth/calendar/disconnect?provider=GOOGLE
// Removes the encrypted token row for the caller's chosen provider.
// We deliberately don't try to revoke the token at the provider — Google's
// revoke endpoint can fail if the token is already invalid, and the
// effect we care about (we can no longer push events) happens locally.

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const provider = new URL(req.url).searchParams.get("provider")?.toUpperCase()
  if (!provider || !["GOOGLE", "OUTLOOK", "LARK"].includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }

  await prisma.calendarToken.deleteMany({
    where: {
      userId: session.user.id,
      provider: provider as "GOOGLE" | "OUTLOOK" | "LARK",
    },
  })
  await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    update: { calendarProvider: "NONE" },
    create: { userId: session.user.id, calendarProvider: "NONE" },
  })
  return NextResponse.json({ ok: true })
}
