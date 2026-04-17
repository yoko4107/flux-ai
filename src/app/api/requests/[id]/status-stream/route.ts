import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const encoder = new TextEncoder()
  let lastStatus = ""

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      const interval = setInterval(async () => {
        const request = await prisma.reimbursementRequest.findUnique({
          where: { id },
          select: { status: true, updatedAt: true },
        })
        if (request && request.status !== lastStatus) {
          lastStatus = request.status
          send({ status: request.status, updatedAt: request.updatedAt })
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
