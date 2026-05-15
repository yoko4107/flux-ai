export type InviteRole = "EMPLOYEE" | "APPROVER" | "FINANCE" | "ADMIN"

export function parseCSV(text: string): { email: string; role: InviteRole; phone?: string }[] {
  const ROLES = ["EMPLOYEE", "APPROVER", "FINANCE", "ADMIN"] as const
  const lines = text.trim().split("\n").filter(Boolean)
  const results: { email: string; role: InviteRole; phone?: string }[] = []
  for (const line of lines) {
    if (line.startsWith("#") || line.toLowerCase().startsWith("email")) continue
    const [email, role, phone] = line.split(",").map((s) => s.trim())
    if (!email || !email.includes("@")) continue
    const validRole = ROLES.includes((role?.toUpperCase() ?? "") as InviteRole)
      ? (role.toUpperCase() as InviteRole)
      : "EMPLOYEE"
    results.push({ email, role: validRole, phone: phone || undefined })
  }
  return results
}
