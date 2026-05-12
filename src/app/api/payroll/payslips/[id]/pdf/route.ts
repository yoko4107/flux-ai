import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { format } from "date-fns"

// GET /api/payroll/payslips/[id]/pdf — render the payslip as a 1-page A4 PDF.
// Access mirrors /api/payroll/payslips/[id]: employee can fetch their own
// (only once finalized), admin can fetch any in their org, super-admin any.

function fmtMoney(n: { toString: () => string }, currency: string) {
  const v = Number(n.toString())
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(v)
  } catch {
    return `${currency} ${v.toFixed(2)}`
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, email: true, department: true } },
      organization: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  })
  if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const role = session.user.role
  const isOwner = payslip.employeeId === session.user.id
  const isOrgAdmin = role === "ADMIN" && payslip.organizationId === session.user.organizationId
  const isSuperAdmin = role === "SUPER_ADMIN"
  if (!isOrgAdmin && !isSuperAdmin) {
    if (!isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (payslip.status === "DRAFT") return NextResponse.json({ error: "Payslip not yet released" }, { status: 403 })
  }

  // YTD: sum within the same calendar year, FINALIZED/PAID only, up to and
  // including this period.
  const year = payslip.period.slice(0, 4)
  const ytd = await prisma.payslip.aggregate({
    where: {
      employeeId: payslip.employeeId,
      status: { in: ["FINALIZED", "PAID"] },
      period: { gte: `${year}-01`, lte: payslip.period },
    },
    _sum: { grossPay: true, totalDeductions: true, netPay: true },
  })

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842]) // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { width, height } = page.getSize()
  const margin = 50
  let y = height - margin

  const text = (s: string, x: number, yy: number, size = 10, b = false, color = rgb(0.1, 0.1, 0.1)) => {
    page.drawText(s, { x, y: yy, size, font: b ? bold : font, color })
  }
  const hr = (yy: number, color = rgb(0.85, 0.85, 0.85)) => {
    page.drawLine({ start: { x: margin, y: yy }, end: { x: width - margin, y: yy }, thickness: 0.5, color })
  }

  // Header
  text(payslip.organization?.name ?? "Payslip", margin, y, 18, true, rgb(0.04, 0.12, 0.25))
  text("PAYSLIP", width - margin - bold.widthOfTextAtSize("PAYSLIP", 14), y + 3, 14, true, rgb(0.04, 0.12, 0.25))
  y -= 22
  text(`Pay Period: ${payslip.period}`, margin, y, 10, false, rgb(0.35, 0.35, 0.35))
  text(`Status: ${payslip.status}`, width - margin - 100, y, 10, false, rgb(0.35, 0.35, 0.35))
  y -= 14
  text(`Generated: ${format(payslip.generatedAt, "MMM d, yyyy")}`, margin, y, 10, false, rgb(0.35, 0.35, 0.35))
  y -= 18
  hr(y)
  y -= 18

  // Employee block
  text("Employee", margin, y, 9, true, rgb(0.4, 0.4, 0.4))
  text("Pay details", width / 2, y, 9, true, rgb(0.4, 0.4, 0.4))
  y -= 14
  text(payslip.employee.name ?? "—", margin, y, 11, true)
  text(`Currency: ${payslip.currency}`, width / 2, y, 10)
  y -= 13
  text(payslip.employee.email ?? "", margin, y, 9, false, rgb(0.35, 0.35, 0.35))
  text(`Country: ${payslip.countryCode}`, width / 2, y, 10)
  y -= 13
  text(`ID: ${payslip.employee.id}`, margin, y, 9, false, rgb(0.35, 0.35, 0.35))
  text(`Working / paid days: ${payslip.paidDays} / ${payslip.workingDays}`, width / 2, y, 10)
  y -= 18
  hr(y)
  y -= 20

  // Lines — split into earnings and deductions
  const earnings = payslip.lines.filter((l) => l.type === "EARNING")
  const deductions = payslip.lines.filter((l) => l.type === "STATUTORY_DEDUCTION" || l.type === "VOLUNTARY_DEDUCTION")
  const employer = payslip.lines.filter((l) => l.type === "EMPLOYER_CONTRIBUTION")

  const colL = margin
  const colR = width / 2 + 10
  const amtL = width / 2 - 10
  const amtR = width - margin

  text("Earnings", colL, y, 10, true, rgb(0.04, 0.4, 0.2))
  text("Deductions", colR, y, 10, true, rgb(0.6, 0.15, 0.15))
  y -= 14

  const startRows = y
  let yL = startRows
  for (const l of earnings) {
    text(l.componentName, colL, yL, 9)
    const amt = fmtMoney(l.amount, payslip.currency)
    text(amt, amtL - font.widthOfTextAtSize(amt, 9), yL, 9)
    yL -= 13
  }
  let yR = startRows
  for (const l of deductions) {
    text(l.componentName, colR, yR, 9)
    const amt = fmtMoney(l.amount, payslip.currency)
    text(amt, amtR - font.widthOfTextAtSize(amt, 9), yR, 9)
    yR -= 13
  }
  y = Math.min(yL, yR) - 4
  hr(y)
  y -= 14

  // Totals
  const grossLabel = "Gross pay"
  const dedLabel = "Total deductions"
  text(grossLabel, colL, y, 10, true)
  const gross = fmtMoney(payslip.grossPay, payslip.currency)
  text(gross, amtL - bold.widthOfTextAtSize(gross, 10), y, 10, true)
  text(dedLabel, colR, y, 10, true)
  const ded = fmtMoney(payslip.totalDeductions, payslip.currency)
  text(ded, amtR - bold.widthOfTextAtSize(ded, 10), y, 10, true)
  y -= 18
  hr(y, rgb(0.04, 0.12, 0.25))
  y -= 18

  // Net pay — highlighted
  text("Net pay", colL, y, 14, true, rgb(0.04, 0.12, 0.25))
  const net = fmtMoney(payslip.netPay, payslip.currency)
  text(net, amtR - bold.widthOfTextAtSize(net, 14), y, 14, true, rgb(0.04, 0.12, 0.25))
  y -= 26

  // YTD
  text(`Year-to-date (${year})`, colL, y, 9, true, rgb(0.4, 0.4, 0.4))
  y -= 13
  const ytdGross = ytd._sum.grossPay ? fmtMoney(ytd._sum.grossPay, payslip.currency) : fmtMoney(payslip.grossPay, payslip.currency)
  const ytdDed = ytd._sum.totalDeductions ? fmtMoney(ytd._sum.totalDeductions, payslip.currency) : fmtMoney(payslip.totalDeductions, payslip.currency)
  const ytdNet = ytd._sum.netPay ? fmtMoney(ytd._sum.netPay, payslip.currency) : fmtMoney(payslip.netPay, payslip.currency)
  text(`Gross: ${ytdGross}`, colL, y, 9)
  text(`Deductions: ${ytdDed}`, colL + 180, y, 9)
  text(`Net: ${ytdNet}`, colL + 360, y, 9)
  y -= 18

  // Employer-side contributions (informational)
  if (employer.length > 0) {
    hr(y)
    y -= 14
    text("Employer contributions (not deducted from net)", colL, y, 9, true, rgb(0.4, 0.4, 0.4))
    y -= 13
    for (const l of employer) {
      text(l.componentName, colL, y, 9)
      const amt = fmtMoney(l.amount, payslip.currency)
      text(amt, amtR - font.widthOfTextAtSize(amt, 9), y, 9)
      y -= 12
    }
    y -= 4
    text("Employer cost total", colL, y, 9, true)
    const ec = fmtMoney(payslip.employerCost, payslip.currency)
    text(ec, amtR - bold.widthOfTextAtSize(ec, 9), y, 9, true)
    y -= 14
  }

  // Footer
  text(`Generated by FLUX.AI on ${format(new Date(), "MMM d, yyyy HH:mm")}`, margin, margin - 10, 8, false, rgb(0.55, 0.55, 0.55))

  const bytes = await pdf.save()
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${payslip.period}-${payslip.employee.name?.replace(/\s+/g, "-") ?? payslip.employeeId}.pdf"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  })
}
