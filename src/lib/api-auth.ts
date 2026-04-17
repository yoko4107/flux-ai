import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { Role } from "@/generated/prisma"

export async function requireAuth() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null }
  }
  return { error: null, session }
}

export async function requireRole(...roles: Role[]) {
  const { error, session } = await requireAuth()
  if (error) return { error, session: null }
  if (!roles.includes(session!.user.role as Role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null }
  }
  return { error: null, session: session! }
}

export async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized", status: 401, session: null }
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return { error: "Forbidden", status: 403, session: null }
  }
  return { error: null, status: 200, session }
}

export function isSuperAdmin(session: Session) {
  return session.user.role === "SUPER_ADMIN"
}
