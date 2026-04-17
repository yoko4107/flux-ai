import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Only PNG, JPEG, WebP, or SVG logos are allowed" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Logo must be under 2 MB" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`
    return NextResponse.json({ url: dataUrl, filename: file.name })
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
