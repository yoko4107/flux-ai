import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getExchangeRate } from "@/lib/fx-rates"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const currency = req.nextUrl.searchParams.get("currency") || "USD"
  const rate = await getExchangeRate(currency)
  return NextResponse.json({ currency, rate, target: "IDR" })
}
