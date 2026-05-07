import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

/**
 * Server-side guard: any layout that calls this will route a brand-new
 * user (no UserProfile yet, or `isOnboarded` still false) to the
 * onboarding wizard before they can access role-scoped pages.
 *
 * Existing users were backfilled with isOnboarded=true in PR 1's migration,
 * so this only fires for new signups.
 */
export async function requireOnboarded(userId: string): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { isOnboarded: true },
  })
  if (!profile || !profile.isOnboarded) redirect("/onboarding")
}
