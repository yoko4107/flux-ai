import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { sendNotification } from "@/lib/notifications"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE = 10 * 1024 * 1024

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "FINANCE" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: { employee: { select: { id: true } } },
  })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (request.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only APPROVED requests can be marked as paid" },
      { status: 400 }
    )
  }

  const formData = await req.formData()
  const proofFile = formData.get("proofFile") as File | null
  const notes = (formData.get("notes") as string | null) ?? undefined

  let proofUrl: string | undefined

  if (proofFile) {
    if (!ALLOWED_TYPES.includes(proofFile.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, WebP, PDF" },
        { status: 400 }
      )
    }

    if (proofFile.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 })
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    const useFallback = !blobToken || blobToken === "placeholder"

    const rawExt = proofFile.name.split(".").pop() ?? "bin"
    const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    if (!useFallback) {
      const { put } = await import("@vercel/blob")
      const blob = await put(filename, proofFile, { access: "public" })
      proofUrl = blob.url
    } else {
      const dir = "/tmp/proofs"
      await mkdir(dir, { recursive: true })
      const buffer = Buffer.from(await proofFile.arrayBuffer())
      await writeFile(path.join(dir, filename), buffer)
      proofUrl = `/api/files/${filename}`
    }
  }

  const updated = await prisma.reimbursementRequest.update({
    where: { id },
    data: { status: "PAID" },
  })

  await writeAuditLog(prisma, {
    requestId: id,
    actorId: session.user.id,
    action: "REQUEST_PAID",
    details: {
      proofUrl: proofUrl ?? null,
      notes: notes ?? null,
      paidBy: session.user.id,
    },
  })

  await sendNotification({
    userId: request.employee.id,
    requestId: id,
    type: "REQUEST_PAID",
    message: "Your reimbursement has been paid",
  })

  return NextResponse.json(updated)
}
