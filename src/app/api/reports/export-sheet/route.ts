import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"
import { rateLimit } from "@/lib/rate-limit"

interface ReportRow {
  requestId: string
  employeeName: string
  department: string
  category: string
  amount: number
  currency: string
  receiptUrl: string
  submittedAt: Date | null
  approvedAt: Date | null
  paidAt: Date | null
  status: string
  title: string
}

async function getMonthlyData(month: string): Promise<ReportRow[]> {
  const requests = await prisma.reimbursementRequest.findMany({
    where: {
      status: { in: ["APPROVED", "PAID"] },
      month,
    },
    include: {
      employee: { select: { id: true, name: true, email: true, department: true } },
      approvalSteps: { orderBy: { order: "asc" } },
      auditLogs: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { submittedAt: "asc" },
  })

  return requests.map((req) => {
    const approvedSteps = req.approvalSteps.filter((s) => s.status === "APPROVED")
    const approvedAt =
      approvedSteps.length > 0
        ? approvedSteps.reduce((latest, step) =>
            step.decidedAt && (!latest.decidedAt || step.decidedAt > latest.decidedAt)
              ? step
              : latest
          ).decidedAt
        : null

    const paidLog = req.auditLogs.find((l) => l.action === "REQUEST_PAID")
    const paidAt = paidLog?.createdAt ?? null

    return {
      requestId: req.id,
      employeeName: req.employee.name ?? req.employee.email ?? "Unknown",
      department: req.employee.department ?? "—",
      category: req.category,
      amount: Number(req.amount),
      currency: req.currency,
      receiptUrl: req.receiptUrl ?? "",
      submittedAt: req.submittedAt,
      approvedAt,
      paidAt,
      status: req.status,
      title: req.title,
    }
  })
}

function formatDate(d: Date | null): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

function buildCsv(data: ReportRow[], month: string): string {
  const lines: string[] = []

  // === SUMMARY SECTION ===
  lines.push(`REIMBURSEMENT REPORT — ${month}`)
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`)
  lines.push("")

  // Totals by category
  const byCategory: Record<string, { count: number; total: number }> = {}
  const byDepartment: Record<string, { count: number; total: number }> = {}
  const byStatus: Record<string, { count: number; total: number }> = {}
  const byEmployee: Record<string, { count: number; total: number }> = {}
  let grandTotal = 0

  for (const r of data) {
    grandTotal += r.amount
    if (!byCategory[r.category]) byCategory[r.category] = { count: 0, total: 0 }
    byCategory[r.category].count++
    byCategory[r.category].total += r.amount

    if (!byDepartment[r.department]) byDepartment[r.department] = { count: 0, total: 0 }
    byDepartment[r.department].count++
    byDepartment[r.department].total += r.amount

    if (!byStatus[r.status]) byStatus[r.status] = { count: 0, total: 0 }
    byStatus[r.status].count++
    byStatus[r.status].total += r.amount

    if (!byEmployee[r.employeeName]) byEmployee[r.employeeName] = { count: 0, total: 0 }
    byEmployee[r.employeeName].count++
    byEmployee[r.employeeName].total += r.amount
  }

  lines.push("SUMMARY BY CATEGORY")
  lines.push("Category,Count,Total")
  for (const [cat, v] of Object.entries(byCategory)) {
    lines.push(`${cat},${v.count},${v.total.toFixed(2)}`)
  }
  lines.push(`TOTAL,${data.length},${grandTotal.toFixed(2)}`)
  lines.push("")

  lines.push("SUMMARY BY DEPARTMENT")
  lines.push("Department,Count,Total")
  for (const [dept, v] of Object.entries(byDepartment)) {
    lines.push(`"${dept}",${v.count},${v.total.toFixed(2)}`)
  }
  lines.push("")

  lines.push("SUMMARY BY STATUS")
  lines.push("Status,Count,Total")
  for (const [st, v] of Object.entries(byStatus)) {
    lines.push(`${st},${v.count},${v.total.toFixed(2)}`)
  }
  lines.push("")

  lines.push("SUMMARY BY EMPLOYEE")
  lines.push("Employee,Count,Total")
  for (const [emp, v] of Object.entries(byEmployee).sort((a, b) => b[1].total - a[1].total)) {
    lines.push(`"${emp}",${v.count},${v.total.toFixed(2)}`)
  }
  lines.push("")

  // === DETAIL SECTION ===
  lines.push("DETAILED TRANSACTIONS")
  const headers = [
    "Request ID", "Title", "Employee", "Department", "Category",
    "Amount", "Currency", "Status", "Submitted", "Approved", "Paid", "Receipt URL",
  ]
  lines.push(headers.join(","))

  for (const r of data) {
    lines.push([
      r.requestId,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.employeeName.replace(/"/g, '""')}"`,
      `"${r.department.replace(/"/g, '""')}"`,
      r.category,
      r.amount.toFixed(2),
      r.currency,
      r.status,
      formatDate(r.submittedAt),
      formatDate(r.approvedAt),
      formatDate(r.paidAt),
      r.receiptUrl,
    ].join(","))
  }

  return lines.join("\n")
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "FINANCE" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (!rateLimit(`export:${session.user.id}`, 5, 60000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month")

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format. Use YYYY-MM" }, { status: 400 })
  }

  // Parse optional body for summary notes
  let summaryNotes: Array<{ category: string; note: string }> = []
  let generalNotes = ""
  try {
    const body = await req.json()
    summaryNotes = body.summaryNotes || []
    generalNotes = body.generalNotes || ""
  } catch {
    // No body or not JSON — that's fine
  }

  const data = await getMonthlyData(month)

  // Build naming: RI_Name_Month_Year (e.g. RI_Yoko_March_2026)
  const [yearStr, monthStr] = month.split("-")
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const monthName = monthNames[parseInt(monthStr, 10) - 1]
  const userName = session.user.name?.split(" ")[0] || session.user.email?.split("@")[0] || "Finance"
  const sheetTitle = `RI_${userName}_${monthName}_${yearStr}`
  const folderName = `RI_${userName}_${monthName}_${yearStr}`

  const serviceAccountEnv = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT
  const isConfigured =
    serviceAccountEnv &&
    serviceAccountEnv !== "placeholder" &&
    serviceAccountEnv.trim().startsWith("{")

  let sheetUrl: string | undefined
  let csvData: string | undefined
  let message: string | undefined

  // Compute summary data
  const byCategory: Record<string, { count: number; total: number }> = {}
  const byDepartment: Record<string, { count: number; total: number }> = {}
  const byStatus: Record<string, { count: number; total: number }> = {}
  const byEmployee: Record<string, { count: number; total: number; department: string }> = {}
  let grandTotal = 0

  for (const r of data) {
    grandTotal += r.amount

    if (!byCategory[r.category]) byCategory[r.category] = { count: 0, total: 0 }
    byCategory[r.category].count++
    byCategory[r.category].total += r.amount

    if (!byDepartment[r.department]) byDepartment[r.department] = { count: 0, total: 0 }
    byDepartment[r.department].count++
    byDepartment[r.department].total += r.amount

    if (!byStatus[r.status]) byStatus[r.status] = { count: 0, total: 0 }
    byStatus[r.status].count++
    byStatus[r.status].total += r.amount

    if (!byEmployee[r.employeeName]) byEmployee[r.employeeName] = { count: 0, total: 0, department: r.department }
    byEmployee[r.employeeName].count++
    byEmployee[r.employeeName].total += r.amount
  }

  if (isConfigured) {
    try {
      const { google } = await import("googleapis")

      const credentials = JSON.parse(serviceAccountEnv!)
      const googleAuth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      })

      const sheets = google.sheets({ version: "v4", auth: googleAuth })
      const drive = google.drive({ version: "v3", auth: googleAuth })

      const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID

      // Find or create a month folder: RI_Name_Month_Year
      let targetFolderId = parentFolderId
      if (parentFolderId) {
        // Check if folder already exists
        const folderSearch = await drive.files.list({
          q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`,
          fields: "files(id, name)",
          spaces: "drive",
        })

        if (folderSearch.data.files && folderSearch.data.files.length > 0) {
          targetFolderId = folderSearch.data.files[0].id!
        } else {
          // Create the folder
          const folderRes = await drive.files.create({
            requestBody: {
              name: folderName,
              mimeType: "application/vnd.google-apps.folder",
              parents: [parentFolderId],
            },
            fields: "id",
          })
          targetFolderId = folderRes.data.id!
        }
      }

      // Create spreadsheet with 2 sheets: Summary + Transactions
      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: sheetTitle },
          sheets: [
            { properties: { title: "Summary", index: 0 } },
            { properties: { title: "Transactions", index: 1 } },
          ],
        },
      })

      const spreadsheetId = createRes.data.spreadsheetId!
      const summarySheetId = createRes.data.sheets![0].properties!.sheetId!
      const txSheetId = createRes.data.sheets![1].properties!.sheetId!
      sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

      // Move to the target folder
      if (targetFolderId) {
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: targetFolderId,
          requestBody: {},
        })
      }

      // === SUMMARY SHEET ===
      const summaryValues: (string | number)[][] = []

      // Header
      summaryValues.push([`REIMBURSEMENT REPORT — ${month}`])
      summaryValues.push([`Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} by ${session.user.name || session.user.email || "Finance"}`])
      summaryValues.push([`Total Requests: ${data.length}`, "", `Grand Total: ${grandTotal.toFixed(2)}`])
      summaryValues.push([])

      // By Category
      summaryValues.push(["BY CATEGORY", "", ""])
      summaryValues.push(["Category", "# Requests", "Total Amount", "% of Total"])
      for (const [cat, v] of Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)) {
        summaryValues.push([cat, v.count, v.total, grandTotal > 0 ? Math.round((v.total / grandTotal) * 100) : 0])
      }
      summaryValues.push(["TOTAL", data.length, grandTotal, 100])
      summaryValues.push([])

      // By Department
      summaryValues.push(["BY DEPARTMENT", "", ""])
      summaryValues.push(["Department", "# Requests", "Total Amount", "% of Total"])
      for (const [dept, v] of Object.entries(byDepartment).sort((a, b) => b[1].total - a[1].total)) {
        summaryValues.push([dept, v.count, v.total, grandTotal > 0 ? Math.round((v.total / grandTotal) * 100) : 0])
      }
      summaryValues.push([])

      // By Status
      summaryValues.push(["BY STATUS", "", ""])
      summaryValues.push(["Status", "# Requests", "Total Amount"])
      for (const [st, v] of Object.entries(byStatus)) {
        summaryValues.push([st, v.count, v.total])
      }
      summaryValues.push([])

      // By Employee (top spenders)
      summaryValues.push(["BY EMPLOYEE (ranked by amount)", "", ""])
      summaryValues.push(["Employee", "Department", "# Requests", "Total Amount", "Avg per Request"])
      for (const [emp, v] of Object.entries(byEmployee).sort((a, b) => b[1].total - a[1].total)) {
        summaryValues.push([emp, v.department, v.count, v.total, v.count > 0 ? Math.round(v.total / v.count * 100) / 100 : 0])
      }

      // Category notes from finance user
      if (summaryNotes.length > 0) {
        summaryValues.push([])
        summaryValues.push(["CATEGORY NOTES", "", ""])
        for (const note of summaryNotes) {
          summaryValues.push([note.category, note.note])
        }
      }

      // General notes
      if (generalNotes) {
        summaryValues.push([])
        summaryValues.push(["GENERAL NOTES", "", ""])
        summaryValues.push([generalNotes])
      }

      // Sheet link info
      summaryValues.push([])
      summaryValues.push([`Sheet: ${sheetTitle}`, `Folder: ${folderName}`, `Link: ${sheetUrl}`])

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Summary!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: summaryValues },
      })

      // === TRANSACTIONS SHEET ===
      const txHeaders = [
        "Request ID", "Title", "Employee", "Department", "Category",
        "Amount", "Currency", "Status", "Submitted", "Approved", "Paid", "Receipt URL",
      ]

      const txRows = data.map((r) => [
        r.requestId, r.title, r.employeeName, r.department, r.category,
        r.amount, r.currency, r.status,
        formatDate(r.submittedAt), formatDate(r.approvedAt), formatDate(r.paidAt),
        r.receiptUrl,
      ])

      // Totals by category at bottom
      const catTotalRows: (string | number)[][] = [[]]
      for (const [cat, v] of Object.entries(byCategory)) {
        catTotalRows.push([`TOTAL ${cat}`, "", "", "", cat, v.total, "", "", "", "", "", ""])
      }
      catTotalRows.push(["GRAND TOTAL", "", "", "", "", grandTotal, "", "", "", "", "", ""])

      const txValues = [txHeaders, ...txRows, ...catTotalRows]

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Transactions!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: txValues },
      })

      // === FORMATTING ===
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Summary: bold title row
            {
              repeatCell: {
                range: { sheetId: summarySheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, fontSize: 14 },
                    backgroundColor: { red: 0.2, green: 0.4, blue: 0.7 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            // Summary: bold section headers
            ...[4, 5, ...findSectionHeaderRows(summaryValues)].map((row) => ({
              repeatCell: {
                range: { sheetId: summarySheetId, startRowIndex: row, endRowIndex: row + 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            })),
            // Summary: auto-resize columns
            {
              autoResizeDimensions: {
                dimensions: { sheetId: summarySheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 5 },
              },
            },
            // Transactions: bold header
            {
              repeatCell: {
                range: { sheetId: txSheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.85, green: 0.92, blue: 0.98 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
            // Transactions: freeze header row
            {
              updateSheetProperties: {
                properties: { sheetId: txSheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount",
              },
            },
            // Transactions: auto-resize columns
            {
              autoResizeDimensions: {
                dimensions: { sheetId: txSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 12 },
              },
            },
            // Transactions: number format on Amount column (F)
            {
              repeatCell: {
                range: { sheetId: txSheetId, startColumnIndex: 5, endColumnIndex: 6, startRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
                  },
                },
                fields: "userEnteredFormat.numberFormat",
              },
            },
            // Bold totals rows at bottom of transactions
            {
              repeatCell: {
                range: {
                  sheetId: txSheetId,
                  startRowIndex: txRows.length + 2, // +1 header +1 empty row
                  endRowIndex: txValues.length,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.95, green: 0.95, blue: 0.85 },
                  },
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)",
              },
            },
          ],
        },
      })
    } catch (err) {
      console.error("Google Sheets export failed:", err)
      return NextResponse.json(
        { error: "Google Sheets export failed", details: String(err) },
        { status: 500 }
      )
    }
  } else {
    csvData = buildCsv(data, month)
    message = `Google Sheets not configured, returning CSV. Filename: ${sheetTitle}.csv`
  }

  // Save MonthlyReport record (upsert)
  await prisma.monthlyReport.upsert({
    where: { month },
    create: { month, generatedById: session.user.id, sheetUrl: sheetUrl ?? null },
    update: { generatedById: session.user.id, sheetUrl: sheetUrl ?? null, generatedAt: new Date() },
  })

  await writeAuditLog(prisma, {
    actorId: session.user.id,
    action: "REPORT_EXPORTED",
    details: {
      month,
      sheetUrl: sheetUrl ?? null,
      totalRequests: data.length,
      grandTotal,
      format: isConfigured ? "google_sheets" : "csv",
    },
  })

  return NextResponse.json({ sheetUrl, csvData, message })
}

// Helper: find rows that start with "BY " — these are section headers
function findSectionHeaderRows(values: (string | number)[][]): number[] {
  const rows: number[] = []
  for (let i = 0; i < values.length; i++) {
    const first = String(values[i][0] || "")
    if (first.startsWith("BY ")) rows.push(i)
  }
  return rows
}
