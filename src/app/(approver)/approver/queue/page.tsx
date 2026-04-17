import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getConfig } from "@/lib/config"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface QueueItem {
  step: {
    id: string
    order: number
    status: string
  }
  request: {
    id: string
    title: string
    amount: string
    currency: string
    category: string
    status: string
    submittedAt: string | null
    createdAt: string
    employee: {
      id: string
      name: string | null
      email: string | null
      department: string | null
    }
  }
  employee: {
    id: string
    name: string | null
    email: string | null
    department: string | null
  }
  daysRemaining: number
}

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return result
}

function businessDaysRemaining(deadline: Date): number {
  const now = new Date()
  if (deadline <= now) return 0
  let days = 0
  const cur = new Date(now)
  while (cur < deadline) {
    cur.setDate(cur.getDate() + 1)
    const day = cur.getDay()
    if (day !== 0 && day !== 6) days++
  }
  return days
}

export default async function ApproverQueuePage() {
  const session = await auth()
  const userId = session!.user.id

  const steps = await prisma.approvalStep.findMany({
    where: { approverId: userId, status: "PENDING" },
    include: {
      request: {
        include: {
          employee: { select: { id: true, name: true, email: true, department: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const approvalDeadlineConfig = await getConfig(prisma, "approvalDeadline")
  const deadlineBusinessDays =
    (approvalDeadlineConfig as { businessDays?: number } | null)?.businessDays ?? 3

  const now = new Date()
  const items: QueueItem[] = steps.map((step) => {
    const submittedAt = step.request.submittedAt ?? step.request.createdAt
    const deadline = addBusinessDays(submittedAt, deadlineBusinessDays)
    const isOverdue = deadline <= now
    const daysRemaining = isOverdue
      ? -Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
      : businessDaysRemaining(deadline)

    return {
      step: { id: step.id, order: step.order, status: step.status },
      request: {
        id: step.request.id,
        title: step.request.title,
        amount: String(step.request.amount),
        currency: step.request.currency,
        category: step.request.category,
        status: step.request.status,
        submittedAt: step.request.submittedAt?.toISOString() ?? null,
        createdAt: step.request.createdAt.toISOString(),
        employee: step.request.employee,
      },
      employee: step.request.employee,
      daysRemaining,
    }
  })

  items.sort((a, b) => a.daysRemaining - b.daysRemaining)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Approval Queue</h1>
        <span className="text-sm text-gray-500">{items.length} pending</span>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg font-medium">No pending requests</p>
          <p className="text-sm mt-1">You are all caught up!</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Days Remaining</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => {
                const dayBadge =
                  item.daysRemaining <= 0
                    ? "bg-red-100 text-red-700"
                    : item.daysRemaining <= 2
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"

                const daysLabel =
                  item.daysRemaining <= 0
                    ? `Overdue (${Math.abs(item.daysRemaining)}d)`
                    : `${item.daysRemaining}d`

                return (
                  <tr key={item.step.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.employee.name ?? "—"}</div>
                      <div className="text-xs text-gray-500">{item.employee.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/approver/requests/${item.request.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {item.request.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {item.request.category.charAt(0) + item.request.category.slice(1).toLowerCase()}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {item.request.currency} {Number(item.request.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.employee.department ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", dayBadge)}>
                        {daysLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        Pending
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
