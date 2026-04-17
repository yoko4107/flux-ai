import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import QRCode from "qrcode"
import { format } from "date-fns"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true, department: true } },
      approvalSteps: {
        include: { approver: { select: { id: true, name: true, email: true } } },
        orderBy: { order: "asc" },
      },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Access control: finance, admin, or the employee who owns the request
  const role = session.user.role
  if (
    role !== "FINANCE" &&
    role !== "ADMIN" &&
    !(role === "EMPLOYEE" && request.employeeId === session.user.id)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Build PDF
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const { width, height } = page.getSize()
  const margin = 50
  const lineH = 20
  let y = height - margin

  const drawText = (text: string, x: number, yPos: number, size = 11, bold = false, colorRgb = rgb(0, 0, 0)) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? boldFont : font,
      color: colorRgb,
    })
  }

  // Header
  drawText("Reimbursement Proof Bundle", margin, y, 18, true, rgb(0.1, 0.1, 0.5))
  y -= lineH * 1.5
  drawText(`Request ID: ${id}`, margin, y, 10, false, rgb(0.4, 0.4, 0.4))
  y -= lineH
  drawText(`Generated: ${format(new Date(), "MMM d, yyyy HH:mm")}`, margin, y, 10, false, rgb(0.4, 0.4, 0.4))
  y -= lineH * 1.5

  // Divider line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= lineH * 1.5

  // Request Details section
  drawText("Request Details", margin, y, 13, true)
  y -= lineH * 1.2

  const employeeName = request.employee.name ?? request.employee.email ?? "Unknown"
  const details: [string, string][] = [
    ["Title", request.title],
    ["Employee", employeeName],
    ["Department", request.employee.department ?? "—"],
    ["Amount", `${request.currency} ${Number(request.amount).toFixed(2)}`],
    ["Category", request.category],
    ["Status", request.status],
    ["Submitted", request.submittedAt ? format(new Date(request.submittedAt), "MMM d, yyyy") : "—"],
  ]

  for (const [label, value] of details) {
    drawText(`${label}:`, margin, y, 10, true)
    drawText(value, margin + 100, y, 10)
    y -= lineH
  }

  y -= lineH * 0.5

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  })
  y -= lineH * 1.5

  // Approval Record section
  drawText("Approval Record", margin, y, 13, true)
  y -= lineH * 1.2

  if (request.approvalSteps.length === 0) {
    drawText("No approval steps found.", margin, y, 10, false, rgb(0.5, 0.5, 0.5))
    y -= lineH
  } else {
    // Table header
    const colX = [margin, margin + 120, margin + 220, margin + 300, margin + 400]
    const colHeaders = ["Approver Name", "Role", "Decision", "Comment", "Timestamp"]
    for (let i = 0; i < colHeaders.length; i++) {
      drawText(colHeaders[i], colX[i], y, 9, true)
    }
    y -= lineH * 0.3
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })
    y -= lineH * 0.8

    for (const step of request.approvalSteps) {
      if (y < margin + 80) {
        // Add new page if running out of space
        const newPage = pdfDoc.addPage([595, 842])
        // (simplified - just continue on same page for now)
        y = margin + 80
      }
      const approverName = step.approver.name ?? step.approver.email ?? "Unknown"
      const role = "APPROVER"
      const decision = step.status
      const comment = step.comment ? step.comment.slice(0, 30) : "—"
      const timestamp = step.decidedAt ? format(new Date(step.decidedAt), "MMM d, yyyy") : "Pending"

      drawText(approverName.slice(0, 18), colX[0], y, 9)
      drawText(role, colX[1], y, 9)
      drawText(decision, colX[2], y, 9)
      drawText(comment, colX[3], y, 9)
      drawText(timestamp, colX[4], y, 9)
      y -= lineH
    }
  }

  y -= lineH

  // Divider
  if (y > margin + 120) {
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    })
    y -= lineH * 1.5
  }

  // QR Code
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const requestUrl = `${baseUrl}/requests/${id}`

  try {
    const qrDataUrl = await QRCode.toDataURL(requestUrl)
    const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64")
    const qrImage = await pdfDoc.embedPng(qrImageBytes)

    const qrSize = 80
    if (y > margin + qrSize + 20) {
      drawText("Verification QR Code", margin, y, 11, true)
      y -= lineH
      drawText(requestUrl, margin, y, 8, false, rgb(0.3, 0.3, 0.7))
      y -= lineH * 0.5

      page.drawImage(qrImage, {
        x: margin,
        y: y - qrSize,
        width: qrSize,
        height: qrSize,
      })
    }
  } catch (err) {
    console.error("QR code generation failed:", err)
  }

  const pdfBytes = await pdfDoc.save()

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="proof-bundle-${id}.pdf"`,
    },
  })
}
