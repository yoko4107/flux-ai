import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  // Sanitize filename to prevent path traversal
  const safe = path.basename(filename)
  const filePath = path.join("/tmp/receipts", safe)

  try {
    const data = await readFile(filePath)
    const ext = safe.split(".").pop()?.toLowerCase() ?? ""
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      pdf: "application/pdf",
    }
    const contentType = mimeTypes[ext] ?? "application/octet-stream"
    return new NextResponse(data, {
      headers: { "Content-Type": contentType },
    })
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}
