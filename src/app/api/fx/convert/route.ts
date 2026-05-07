import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { convert } from "@/lib/fx-rates"

// GET /api/fx/convert?from=USD&to=EUR&amount=1
//
// Lightweight wrapper around lib/fx-rates.convert so the per-diem form can
// preview the rate the server will use when converting the policy USD rate
// into the employee's chosen claim currency. Auth-required to avoid
// abusing as a public exchange-rate API.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const from = (url.searchParams.get("from") || "USD").toUpperCase()
  const to = (url.searchParams.get("to") || "USD").toUpperCase()
  const amountParam = url.searchParams.get("amount")
  const amount = amountParam ? Number(amountParam) : 1
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 })
  }
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return NextResponse.json({ error: "Invalid currency code (need ISO-4217)" }, { status: 400 })
  }
  const result = await convert(amount, from, to)
  return NextResponse.json({ from, to, amount, ...result })
}
