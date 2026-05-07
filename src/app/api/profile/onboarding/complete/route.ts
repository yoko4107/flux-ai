import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Marks the caller's UserProfile as onboarded. Called from the final
// step of the onboarding wizard. Idempotent.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.userProfile.upsert({
    where: { userId: session.user.id },
    update: { isOnboarded: true },
    create: { userId: session.user.id, isOnboarded: true },
  })
  return NextResponse.json({ profile })
}
