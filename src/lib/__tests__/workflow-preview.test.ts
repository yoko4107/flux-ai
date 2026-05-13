import { describe, it, expect } from "vitest"
import { derivePreviewSteps } from "@/lib/workflow-preview-helpers"

describe("derivePreviewSteps", () => {
  it("sequential: marks each step as non-parallel", () => {
    const steps = derivePreviewSteps({ mode: "sequential", approvers: ["u1", "u2"] })
    expect(steps).toEqual([{ id: "u1", parallel: false }, { id: "u2", parallel: false }])
  })
  it("parallel: marks each step as parallel", () => {
    const steps = derivePreviewSteps({ mode: "parallel", approvers: ["u1", "u2"] })
    expect(steps).toEqual([{ id: "u1", parallel: true }, { id: "u2", parallel: true }])
  })
  it("empty approvers: returns empty array", () => {
    const steps = derivePreviewSteps({ mode: "sequential", approvers: [] })
    expect(steps).toEqual([])
  })
})
