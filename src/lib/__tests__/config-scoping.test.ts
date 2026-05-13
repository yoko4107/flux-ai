import { describe, it, expect, vi } from "vitest"
import { mergeConfigs, validateCCOwnership } from "@/lib/config-scoping"
import type { PrismaClient } from "@/generated/prisma"

// Minimal row shape for testing
type Row = { key: string; value: unknown; id: string }

describe("mergeConfigs", () => {
  it("CC row wins over org row for same key", () => {
    const ccRows: Row[] = [{ key: "submissionDeadline", value: 15, id: "cc1" }]
    const orgRows: Row[] = [{ key: "submissionDeadline", value: 31, id: "org1" }]
    const result = mergeConfigs(ccRows, orgRows)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(15)
    expect(result[0].id).toBe("cc1")
  })

  it("org-wide row returned as fallback when no CC row for that key", () => {
    const ccRows: Row[] = []
    const orgRows: Row[] = [{ key: "approvalDeadline", value: 7, id: "org2" }]
    const result = mergeConfigs(ccRows, orgRows)
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(7)
    expect(result[0].id).toBe("org2")
  })

  it("extra CC rows not in org are included", () => {
    const ccRows: Row[] = [
      { key: "submissionDeadline", value: 10, id: "cc1" },
      { key: "requireReceiptAbove", value: 500, id: "cc2" },
    ]
    const orgRows: Row[] = [{ key: "submissionDeadline", value: 20, id: "org1" }]
    const result = mergeConfigs(ccRows, orgRows)
    expect(result).toHaveLength(2)
    const keys = result.map((r) => r.key)
    expect(keys).toContain("submissionDeadline")
    expect(keys).toContain("requireReceiptAbove")
  })

  it("empty ccRows returns all orgRows", () => {
    const ccRows: Row[] = []
    const orgRows: Row[] = [
      { key: "submissionDeadline", value: 20, id: "org1" },
      { key: "approvalDeadline", value: 5, id: "org2" },
    ]
    const result = mergeConfigs(ccRows, orgRows)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(["org1", "org2"]))
  })

  it("empty orgRows returns all ccRows", () => {
    const ccRows: Row[] = [
      { key: "submissionDeadline", value: 10, id: "cc1" },
      { key: "requireReceiptAbove", value: 200, id: "cc2" },
    ]
    const orgRows: Row[] = []
    const result = mergeConfigs(ccRows, orgRows)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(expect.arrayContaining(["cc1", "cc2"]))
  })
})

describe("validateCCOwnership", () => {
  function makePrisma(findFirstResult: { id: string } | null) {
    return {
      costCenter: {
        findFirst: vi.fn().mockResolvedValue(findFirstResult),
      },
    } as unknown as PrismaClient
  }

  it("returns truthy sentinel for null costCenterId (org-wide, always allowed)", async () => {
    const prisma = makePrisma(null) // should not be called
    const result = await validateCCOwnership(prisma, null, "org-1")
    expect(result).toBeTruthy()
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
  })

  it("returns the CostCenter when costCenterId belongs to orgId", async () => {
    const prisma = makePrisma({ id: "cc-1" })
    const result = await validateCCOwnership(prisma, "cc-1", "org-1")
    expect(result).toEqual({ id: "cc-1" })
    expect(prisma.costCenter.findFirst).toHaveBeenCalledWith({
      where: { id: "cc-1", organizationId: "org-1" },
      select: { id: true },
    })
  })

  it("returns null when costCenterId belongs to a different org", async () => {
    const prisma = makePrisma(null) // not found for this org
    const result = await validateCCOwnership(prisma, "cc-foreign", "org-1")
    expect(result).toBeNull()
  })

  it("returns null when costCenterId does not exist", async () => {
    const prisma = makePrisma(null)
    const result = await validateCCOwnership(prisma, "nonexistent-cc", "org-1")
    expect(result).toBeNull()
  })
})
