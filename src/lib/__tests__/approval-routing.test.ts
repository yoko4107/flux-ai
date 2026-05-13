import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  resolveCommittee,
  buildApprovalSteps,
  selectNotifyTargets,
} from "../approval-routing-helpers"

// Mock the config module
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(),
}))

import { getConfig } from "@/lib/config"

const mockGetConfig = vi.mocked(getConfig)

describe("resolveCommittee", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("Test 1 (CC lookup): returns CC-specific committee over org-wide when CC ID given", async () => {
    const ccCommittee = { mode: "sequential", approvers: ["user-cc-1", "user-cc-2"] }
    const orgCommittee = { mode: "parallel", approvers: ["user-org-1"] }

    // CC-specific row wins
    mockGetConfig.mockResolvedValueOnce(ccCommittee)

    const mockPrisma = {} as any
    const result = await resolveCommittee(mockPrisma, "org-123", "cc-456")

    expect(mockGetConfig).toHaveBeenCalledWith(mockPrisma, "approvalCommittee", "org-123", "cc-456")
    expect(result).toEqual(ccCommittee)
    // Should NOT equal org-wide committee
    expect(result).not.toEqual(orgCommittee)
  })

  it("Test 4 (fallback): returns org-wide committee when no CC-specific committee exists", async () => {
    const orgCommittee = { mode: "parallel", approvers: ["user-org-1"] }

    // No CC committee — getConfig falls back to org-wide (that's getConfig's job)
    mockGetConfig.mockResolvedValueOnce(orgCommittee)

    const mockPrisma = {} as any
    const result = await resolveCommittee(mockPrisma, "org-123", null)

    expect(result).toEqual(orgCommittee)
  })

  it("returns null when no committee exists at any level", async () => {
    mockGetConfig.mockResolvedValueOnce(null)

    const mockPrisma = {} as any
    const result = await resolveCommittee(mockPrisma, "org-123", "cc-456")

    expect(result).toBeNull()
  })
})

describe("buildApprovalSteps", () => {
  it("Test 2 (APPR-02/APPR-03): maps flat approvers[] to ApprovalStep[] with correct order", () => {
    const approvers = ["user-a", "user-b", "user-c"]
    const requestId = "req-001"

    const steps = buildApprovalSteps(requestId, approvers)

    expect(steps).toHaveLength(3)
    expect(steps[0]).toEqual({ requestId: "req-001", approverId: "user-a", order: 0 })
    expect(steps[1]).toEqual({ requestId: "req-001", approverId: "user-b", order: 1 })
    expect(steps[2]).toEqual({ requestId: "req-001", approverId: "user-c", order: 2 })
  })

  it("Test 3 (APPR-04): empty approvers[] produces zero ApprovalStep rows", () => {
    const steps = buildApprovalSteps("req-001", [])
    expect(steps).toHaveLength(0)
  })
})

describe("selectNotifyTargets", () => {
  const steps = [
    { requestId: "req-001", approverId: "user-a", order: 0 },
    { requestId: "req-001", approverId: "user-b", order: 1 },
    { requestId: "req-001", approverId: "user-c", order: 2 },
  ]

  it("Test 5a (APPR-01 parallel): parallel mode notifies all approvers simultaneously", () => {
    const targets = selectNotifyTargets("parallel", steps)
    expect(targets).toHaveLength(3)
    expect(targets).toEqual(["user-a", "user-b", "user-c"])
  })

  it("Test 5b (APPR-01 sequential): sequential mode notifies only the first approver", () => {
    const targets = selectNotifyTargets("sequential", steps)
    expect(targets).toHaveLength(1)
    expect(targets).toEqual(["user-a"])
  })

  it("returns empty array when no steps provided", () => {
    const targets = selectNotifyTargets("parallel", [])
    expect(targets).toHaveLength(0)
  })
})
