import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, PDF" },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum 10MB." }, { status: 400 })
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  const useFallback = !blobToken || blobToken === "placeholder"

  const rawExt = file.name.split(".").pop() ?? "bin"
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  if (!useFallback) {
    // Use Vercel Blob
    const { put } = await import("@vercel/blob")
    const blob = await put(filename, file, { access: "public" })
    return NextResponse.json({ url: blob.url })
  }

  // Fallback: save to /tmp/receipts/
  const dir = "/tmp/receipts"
  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buffer)

  return NextResponse.json({ url: `/api/files/${filename}` })
}
