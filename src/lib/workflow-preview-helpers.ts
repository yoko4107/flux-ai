export interface PreviewStep {
  id: string
  parallel: boolean
}

export function derivePreviewSteps(
  committee: { mode: string; approvers: string[] }
): PreviewStep[] {
  return committee.approvers.map((id) => ({ id, parallel: committee.mode === "parallel" }))
}
