"use client"

// Reusable payslip render used by both admin and employee detail pages.
// Mirrors the layout the PDF produces so what users see on screen
// matches the downloaded file.

type Line = {
  id?: string
  componentCode: string
  componentName: string
  type: string
  amount: string | number
  description?: string | null
  sortOrder: number
}

type Payslip = {
  id: string
  employee: { id: string; name: string | null; email: string }
  period: string
  countryCode: string
  currency: string
  status: "DRAFT" | "FINALIZED" | "PAID"
  workingDays: number
  paidDays: number
  grossPay: string | number
  taxableIncome: string | number
  totalDeductions: string | number
  netPay: string | number
  employerCost: string | number
  generatedAt: string
  finalizedAt: string | null
  paidAt: string | null
  notes: string | null
  lines: Line[]
}

export function PayslipView({ payslip }: { payslip: Payslip }) {
  const earnings = payslip.lines.filter((l) => l.type === "EARNING")
  const statutory = payslip.lines.filter((l) => l.type === "STATUTORY_DEDUCTION")
  const voluntary = payslip.lines.filter((l) => l.type === "VOLUNTARY_DEDUCTION")
  const employer = payslip.lines.filter((l) => l.type === "EMPLOYER_CONTRIBUTION")

  return (
    <article className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Payslip</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">{payslip.employee.name ?? payslip.employee.email}</h2>
          <p className="text-sm text-gray-500">{payslip.employee.email}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-900">Pay period</p>
          <p className="font-mono text-lg text-gray-900">{payslip.period}</p>
          <StatusBadge status={payslip.status} />
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-200 px-6 py-4 text-sm">
        <Meta label="Country" value={payslip.countryCode} />
        <Meta label="Currency" value={payslip.currency} />
        <Meta label="Working days" value={String(payslip.workingDays)} />
        <Meta label="Paid days" value={String(payslip.paidDays)} />
      </section>

      <section className="grid md:grid-cols-2 gap-px bg-gray-100">
        <Block title="Earnings" lines={earnings} currency={payslip.currency} accent="text-emerald-700" emptyText="No earnings yet" />
        <Block
          title="Deductions"
          lines={[...statutory, ...voluntary]}
          currency={payslip.currency}
          accent="text-rose-700"
          emptyText="No deductions"
        />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-gray-200 px-6 py-4 text-sm">
        <Total label="Gross pay" value={payslip.grossPay} currency={payslip.currency} />
        <Total label="Taxable" value={payslip.taxableIncome} currency={payslip.currency} />
        <Total label="Total deductions" value={payslip.totalDeductions} currency={payslip.currency} negative />
        <Total label="Net pay" value={payslip.netPay} currency={payslip.currency} highlight />
      </section>

      {employer.length > 0 && (
        <section className="border-t border-gray-200 px-6 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Employer contributions (not deducted from net)</h3>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50">
            {employer.map((l, i) => (
              <li key={l.id ?? i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">{l.componentName}</span>
                <span className="tabular-nums text-gray-900">{fmt(l.amount, payslip.currency)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between px-3 py-2 text-sm font-semibold border-t border-gray-200">
              <span className="text-gray-700">Employer cost total</span>
              <span className="tabular-nums">{fmt(payslip.employerCost, payslip.currency)}</span>
            </li>
          </ul>
        </section>
      )}

      <footer className="border-t border-gray-200 px-6 py-3 text-[11px] text-gray-500 space-y-0.5">
        <p>Generated {new Date(payslip.generatedAt).toLocaleString()}</p>
        {payslip.finalizedAt && <p>Finalized {new Date(payslip.finalizedAt).toLocaleString()}</p>}
        {payslip.paidAt && <p>Paid {new Date(payslip.paidAt).toLocaleString()}</p>}
        {payslip.notes && <p className="pt-2 italic">{payslip.notes}</p>}
      </footer>
    </article>
  )
}

function Block({ title, lines, currency, accent, emptyText }: {
  title: string
  lines: Line[]
  currency: string
  accent: string
  emptyText: string
}) {
  const total = lines.reduce((s, l) => s + Number(l.amount), 0)
  return (
    <div className="bg-white p-5">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>{title}</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {lines.map((l, i) => (
            <li key={l.id ?? i} className="flex items-baseline justify-between py-1.5">
              <div>
                <p className="text-sm text-gray-800">{l.componentName}</p>
                {l.description && <p className="text-[11px] text-gray-500">{l.description}</p>}
              </div>
              <span className="text-sm tabular-nums text-gray-900">{fmt(l.amount, currency)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between pt-2 border-t border-gray-200 mt-2">
            <span className="text-sm font-semibold text-gray-700">Subtotal</span>
            <span className={`text-sm font-semibold tabular-nums ${accent}`}>{fmt(total, currency)}</span>
          </li>
        </ul>
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

function Total({ label, value, currency, highlight, negative }: { label: string; value: string | number; currency: string; highlight?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${highlight ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-base font-bold tabular-nums ${highlight ? "text-emerald-800" : negative ? "text-rose-700" : "text-gray-900"}`}>
        {fmt(value, currency)}
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-700 ring-gray-200",
    FINALIZED: "bg-blue-50 text-blue-700 ring-blue-200",
    PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }
  return <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${palette[status] ?? ""}`}>{status}</span>
}

function fmt(v: string | number, c: string) {
  const n = typeof v === "string" ? Number(v) : v
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n)
  } catch { return `${c} ${n.toFixed(2)}` }
}
