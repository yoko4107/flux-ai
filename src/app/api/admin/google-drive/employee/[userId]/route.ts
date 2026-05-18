import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createEmployeeFolder, driveFolderUrl } from "@/lib/google-drive"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await params
  const orgId = session.user.organizationId
  if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, organizationId: true, driveFolderId: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const isSuperAdmin = session.user.role === "SUPER_ADMIN"
  if (!isSuperAdmin && user.organizationId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (user.driveFolderId) {
    return NextResponse.json({ folderId: user.driveFolderId, folderUrl: driveFolderUrl(user.driveFolderId) })
  }

  try {
    const folderId = await createEmployeeFolder(orgId, userId, user.name ?? user.email ?? userId, user.email ?? undefined)
    return NextResponse.json({ folderId, folderUrl: driveFolderUrl(folderId) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
