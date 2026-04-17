import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const type = formData.get("type") as string | null // "national-id" | "selfie"

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    // In dev: create an object URL from the blob and return it
    // In production: upload to S3/Vercel Blob
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`

    return NextResponse.json({ url: dataUrl, type, filename: file.name })
  } catch {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
