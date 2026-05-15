import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { driveFolderUrl } from "@/lib/google-drive"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const orgId = session.user.organizationId
  if (!orgId) return NextResponse.json({ connected: false })

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { driveEncryptedToken: true, driveRootFolderId: true },
  })

  const connected = !!org?.driveEncryptedToken
  return NextResponse.json({
    connected,
    rootFolderId: org?.driveRootFolderId ?? null,
    rootFolderUrl: org?.driveRootFolderId ? driveFolderUrl(org.driveRootFolderId) : null,
  })
}
