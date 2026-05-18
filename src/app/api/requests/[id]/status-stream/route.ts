import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } })
  }

  const { id } = await params

  // Verify the user has access to this request
  const request = await prisma.reimbursementRequest.findUnique({
    where: { id },
    select: { employeeId: true, employee: { select: { organizationId: true } } },
  })
  if (!request) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } })
  }

  const isOwner = request.employeeId === session.user.id
  const isSameOrg = session.user.organizationId === request.employee.organizationId
  const hasOrgRole = ["ADMIN", "FINANCE", "APPROVER"].includes(session.user.role)
  const isSuperAdmin = session.user.role === "SUPER_ADMIN"

  if (!isOwner && !(isSameOrg && hasOrgRole) && !isSuperAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } })
  }

  const encoder = new TextEncoder()
  let lastStatus = ""

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const interval = setInterval(async () => {
        const req = await prisma.reimbursementRequest.findUnique({
          where: { id },
          select: { status: true, updatedAt: true },
        })
        if (req && req.status !== lastStatus) {
          lastStatus = req.status
          send({ status: req.status, updatedAt: req.updatedAt })
        }
      }, 5000)

      req.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
