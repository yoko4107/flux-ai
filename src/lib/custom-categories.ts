import { z } from "zod"

export interface CustomCategory {
  name: string
  code: string
  enabled: boolean
}

export const customCategorySchema = z.object({
  name: z.string().min(1).max(60),
  code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
  enabled: z.boolean(),
})

/**
 * The 12 default Prisma Category enum values in canonical order.
 * Kept in sync with the prisma schema Category enum.
 */
const DEFAULT_CATEGORY_CODES: string[] = [
  "TRAVEL",
  "MEALS",
  "SUPPLIES",
  "ACCOMMODATION",
  "COMMUNICATION",
  "TRAINING",
  "ENTERTAINMENT",
  "MEETING",
  "EQUIPMENT",
  "PRINTING",
  "SOFTWARE",
  "OTHER",
]

/**
 * Merges the 12 default Prisma Category enum values with enabled custom category codes.
 * Returns string[] with defaults first, then enabled custom codes appended.
 * v1: no deduplication — custom codes that match enum values will appear twice.
 */
export function mergeCategories(customCategories: CustomCategory[] | null | unknown): string[] {
  const defaults = [...DEFAULT_CATEGORY_CODES]

  if (!Array.isArray(customCategories)) {
    return defaults
  }

  const enabledCustomCodes = (customCategories as CustomCategory[])
    .filter((c) => c.enabled === true)
    .map((c) => c.code)

  return [...defaults, ...enabledCustomCodes]
}
