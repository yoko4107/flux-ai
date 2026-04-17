import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface TimelineEntry {
  id: string
  type: "submission" | "approval" | "rejection" | "change_request" | "payment" | "action"
  actor: { name: string; role: string }
  description: string
  details?: unknown
  timestamp: Date
}

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
      employee: { select: { id: true, name: true, role: true } },
    },
  })

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const userRole = session.user.role
  const userId = session.user.id

  // Authorization check
  if (userRole === "EMPLOYEE" && request.employeeId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (userRole === "APPROVER") {
    const hasStep = await prisma.approvalStep.findFirst({
      where: { requestId: id, approverId: userId },
    })
    if (!hasStep) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const [auditLogs, approvalSteps, changeRequests] = await Promise.all([
    prisma.auditLog.findMany({
      where: { requestId: id },
      include: { actor: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.approvalStep.findMany({
      where: { requestId: id },
      include: { approver: { select: { name: true, role: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.changeRequest.findMany({
      where: { requestId: id },
      include: { raisedBy: { select: { name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const entries: TimelineEntry[] = []

  // Process audit logs
  for (const log of auditLogs) {
    let type: TimelineEntry["type"] = "action"
    let description = log.action.replace(/_/g, " ").toLowerCase()

    if (log.action === "REQUEST_SUBMITTED" || log.action === "REQUEST_CREATED") {
      type = "submission"
      description = "Submitted the reimbursement request"
    } else if (log.action === "REQUEST_APPROVED" || log.action === "STEP_APPROVED") {
      type = "approval"
      description = "Approved the request"
    } else if (log.action === "REQUEST_REJECTED" || log.action === "STEP_REJECTED") {
      type = "rejection"
      description = "Rejected the request"
    } else if (log.action === "PAYMENT_MARKED" || log.action === "REQUEST_PAID") {
      type = "payment"
      description = "Marked the request as paid"
    } else if (log.action === "CHANGE_REQUESTED") {
      type = "change_request"
      description = "Requested changes"
    }

    entries.push({
      id: `audit-${log.id}`,
      type,
      actor: {
        name: log.actor.name ?? "Unknown",
        role: log.actor.role,
      },
      description,
      details: log.details,
      timestamp: log.createdAt,
    })
  }

  // Process approval steps that have been decided (and might not have audit log entries)
  for (const step of approvalSteps) {
    if (step.status !== "PENDING" && step.decidedAt) {
      const existingEntry = entries.find(
        (e) =>
          Math.abs(new Date(e.timestamp).getTime() - new Date(step.decidedAt!).getTime()) < 2000 &&
          (e.type === "approval" || e.type === "rejection" || e.type === "change_request")
      )
      if (!existingEntry) {
        let type: TimelineEntry["type"] = "action"
        let description = ""
        if (step.status === "APPROVED") {
          type = "approval"
          description = `Approved (Step ${step.order + 1})`
        } else if (step.status === "REJECTED") {
          type = "rejection"
          description = `Rejected (Step ${step.order + 1})`
        } else if (step.status === "CHANGE_REQUESTED") {
          type = "change_request"
          description = `Requested changes (Step ${step.order + 1})`
        }

        if (description) {
          entries.push({
            id: `step-${step.id}`,
            type,
            actor: {
              name: step.approver.name ?? "Unknown",
              role: step.approver.role,
            },
            description,
            details: step.comment ? { comment: step.comment } : undefined,
            timestamp: step.decidedAt,
          })
        }
      }
    }
  }

  // Process change requests
  for (const cr of changeRequests) {
    const existingEntry = entries.find(
      (e) =>
        e.type === "change_request" &&
        Math.abs(new Date(e.timestamp).getTime() - new Date(cr.createdAt).getTime()) < 2000
    )
    if (!existingEntry) {
      entries.push({
        id: `cr-${cr.id}`,
        type: "change_request",
        actor: {
          name: cr.raisedBy.name ?? "Unknown",
          role: cr.raisedBy.role,
        },
        description: `Change requested: ${cr.message.length > 80 ? cr.message.slice(0, 80) + "..." : cr.message}`,
        details: { message: cr.message, status: cr.status },
        timestamp: cr.createdAt,
      })
    }
  }

  // Sort by timestamp ascending
  entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return NextResponse.json(entries)
}
