/**
 * Idempotent seed for the Leave & Calendar module.
 *
 * For every existing organization, ensures:
 *   - The 8 default leave types exist (skips ones already present).
 *   - Public holidays for the org's country are present for the current and
 *     next calendar year (fetched from Nager.at — no key required).
 *
 * Run with:
 *   npx tsx scripts/seed-leave-data.ts
 *
 * Safe to run repeatedly. New orgs created later should call the same logic
 * via the admin onboarding flow.
 */

import { PrismaClient } from "../src/generated/prisma"
import { PrismaPg } from "@prisma/adapter-pg"
import "dotenv/config"

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

interface DefaultLeaveType {
  code: string
  name: string
  description: string
  colorHex: string
  maxDaysPerYear: number | null
  requiresApproval: boolean
  isPaid: boolean
}

const DEFAULT_LEAVE_TYPES: DefaultLeaveType[] = [
  { code: "ANNUAL",       name: "Annual Leave",       description: "Paid annual / vacation leave", colorHex: "#10B981", maxDaysPerYear: 12, requiresApproval: true, isPaid: true },
  { code: "SICK",         name: "Sick Leave",         description: "Medical leave",                  colorHex: "#EF4444", maxDaysPerYear: 12, requiresApproval: false, isPaid: true },
  { code: "PERSONAL",     name: "Personal Leave",     description: "Personal time off",              colorHex: "#8B5CF6", maxDaysPerYear: 3,  requiresApproval: true, isPaid: false },
  { code: "FAMILY",       name: "Family Leave",       description: "Family care / emergency",        colorHex: "#F59E0B", maxDaysPerYear: 5,  requiresApproval: true, isPaid: true },
  { code: "MATERNITY",    name: "Maternity Leave",    description: "Maternity leave",                colorHex: "#EC4899", maxDaysPerYear: 90, requiresApproval: true, isPaid: true },
  { code: "PATERNITY",    name: "Paternity Leave",    description: "Paternity leave",                colorHex: "#3B82F6", maxDaysPerYear: 7,  requiresApproval: true, isPaid: true },
  { code: "BEREAVEMENT",  name: "Bereavement Leave",  description: "Bereavement leave",              colorHex: "#6B7280", maxDaysPerYear: 5,  requiresApproval: true, isPaid: true },
  { code: "COMPENSATORY", name: "Compensatory (Lieu)", description: "Lieu day from approved overtime", colorHex: "#22D3EE", maxDaysPerYear: null, requiresApproval: true, isPaid: true },
]

interface NagerHoliday {
  date: string         // YYYY-MM-DD
  localName: string
  name: string
  countryCode: string
  global: boolean
  types?: string[]
}

async function fetchHolidays(countryCode: string, year: number): Promise<NagerHoliday[]> {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      console.warn(`  Nager.at returned ${res.status} for ${countryCode} ${year} — skipping`)
      return []
    }
    return (await res.json()) as NagerHoliday[]
  } catch (err) {
    console.warn(`  Failed to fetch holidays for ${countryCode} ${year}:`, err)
    return []
  }
}

async function seedLeaveTypesForOrg(orgId: string): Promise<number> {
  let created = 0
  for (const lt of DEFAULT_LEAVE_TYPES) {
    const result = await prisma.leaveType.upsert({
      where: { organizationId_code: { organizationId: orgId, code: lt.code } },
      update: {},
      create: { ...lt, organizationId: orgId },
    })
    if (result) created++
  }
  return created
}

async function seedHolidaysForOrg(orgId: string, countryCode: string): Promise<number> {
  const thisYear = new Date().getUTCFullYear()
  const years = [thisYear, thisYear + 1]
  let inserted = 0

  for (const year of years) {
    const holidays = await fetchHolidays(countryCode, year)
    for (const h of holidays) {
      const date = new Date(`${h.date}T00:00:00Z`)
      try {
        await prisma.publicHoliday.upsert({
          where: {
            organizationId_date_countryCode_name: {
              organizationId: orgId,
              date,
              countryCode: h.countryCode,
              name: h.name,
            },
          },
          update: {},
          create: {
            organizationId: orgId,
            name: h.name,
            date,
            countryCode: h.countryCode,
            isRecurring: !!h.global,
            type: h.types?.[0] ?? "NATIONAL",
          },
        })
        inserted++
      } catch (err) {
        console.warn(`  Failed to insert holiday ${h.name} (${h.date}):`, err)
      }
    }
  }
  return inserted
}

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, countryCode: true },
  })
  console.log(`Seeding leave data for ${orgs.length} organization(s)…\n`)

  for (const org of orgs) {
    console.log(`▶ ${org.name} (${org.id}) — country ${org.countryCode}`)
    const types = await seedLeaveTypesForOrg(org.id)
    console.log(`  • Leave types ensured: ${types}`)
    const holidays = await seedHolidaysForOrg(org.id, org.countryCode)
    console.log(`  • Public holidays upserted: ${holidays}`)
  }

  console.log("\nDone.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
