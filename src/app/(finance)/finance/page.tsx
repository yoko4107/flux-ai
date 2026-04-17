import { auth } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { DollarSign, FileCheck, Clock, FileSpreadsheet } from "lucide-react"
import { cn } from "@/lib/utils"
import { StatusBadge, type RequestStatus } from "@/components/status-badge"

export default async function FinanceDashboard() {
  const currentMonth = new Date().toISOString().slice(0, 7)

  const [approvedUnpaid, paid, totalApproved, lastExport, recentApprovedUnpaid] = await Promise.all([
    prisma.reimbursementRequest.count({ where: { status: "APPROVED" } }),
    prisma.reimbursementRequest.count({ where: { status: "PAID", month: currentMonth } }),
    prisma.reimbursementRequest.aggregate({
      where: { status: { in: ["APPROVED", "PAID"] }, month: currentMonth },
      _sum: { amount: true },
    }),
    // Last export for current month
    prisma.monthlyReport.findUnique({
      where: { month: currentMonth },
      select: { generatedAt: true, sheetUrl: true },
    }),
    // 5 most recent APPROVED-but-unpaid requests
    prisma.reimbursementRequest.findMany({
      where: { status: "APPROVED" },
      include: { employee: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Finance Dashboard</h1>
        <Link href="/finance/reports" className={cn(buttonVariants({ variant: "default" }))}>
          View Reports
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-blue-100 w-fit">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${Number(totalApproved._sum.amount || 0).toFixed(2)}
            </div>
            <p className="text-sm text-gray-500">Total Approved This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-orange-100 w-fit">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvedUnpaid}</div>
            <p className="text-sm text-gray-500">Awaiting Payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-purple-100 w-fit">
              <FileCheck className="h-5 w-5 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{paid}</div>
            <p className="text-sm text-gray-500">Paid This Month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="inline-flex p-2 rounded-lg bg-green-100 w-fit">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {lastExport
                ? new Date(lastExport.generatedAt).toLocaleDateString()
                : "Not yet exported"}
            </div>
            <p className="text-sm text-gray-500">Last Export ({currentMonth})</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Approved (Unpaid) Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {recentApprovedUnpaid.length === 0 ? (
            <p className="text-gray-500 text-sm">No approved requests awaiting payment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">Title</th>
                    <th className="pb-2 font-medium text-gray-500">Employee</th>
                    <th className="pb-2 font-medium text-gray-500">Amount</th>
                    <th className="pb-2 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentApprovedUnpaid.map((req) => (
                    <tr key={req.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/finance/requests/${req.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {req.title}
                        </Link>
                      </td>
                      <td className="py-2 text-gray-600">{req.employee.name ?? "Unknown"}</td>
                      <td className="py-2 font-medium">
                        {req.currency} {Number(req.amount).toFixed(2)}
                      </td>
                      <td className="py-2">
                        <StatusBadge status={req.status as RequestStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
