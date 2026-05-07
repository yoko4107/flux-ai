import { describe, it, expect } from "vitest"
import { generateToken, verifyToken, buildActionUrl } from "./email-tokens"

describe("email-tokens", () => {
  const base = {
    action: "APPROVE_LEAVE" as const,
    resourceId: "lr_abc",
    resourceType: "LEAVE" as const,
    userId: "u_xyz",
  }

  it("round-trips a valid token", () => {
    const token = generateToken(base)
    const decoded = verifyToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded?.action).toBe("APPROVE_LEAVE")
    expect(decoded?.resourceId).toBe("lr_abc")
    expect(decoded?.userId).toBe("u_xyz")
  })

  it("two tokens with the same payload differ (nonce uniqueness)", () => {
    const a = generateToken(base)
    const b = generateToken(base)
    expect(a).not.toBe(b)
    expect(verifyToken(a)?.nonce).not.toBe(verifyToken(b)?.nonce)
  })

  it("rejects tampered signatures", () => {
    const token = generateToken(base)
    const tampered = token.slice(0, -2) + "AA"
    expect(verifyToken(tampered)).toBeNull()
  })

  it("rejects tampered payloads", () => {
    const token = generateToken(base)
    const [, sig] = token.split(".")
    // Replace payload with one that decodes to junk JSON.
    expect(verifyToken(`bm9waGknOg.${sig}`)).toBeNull()
  })

  it("rejects garbage", () => {
    expect(verifyToken("")).toBeNull()
    expect(verifyToken("not-a-token")).toBeNull()
    expect(verifyToken("a.b.c")).toBeNull()
  })

  it("rejects expired tokens", () => {
    const token = generateToken({ ...base, expiresAt: Date.now() - 1000 })
    expect(verifyToken(token)).toBeNull()
  })

  it("buildActionUrl encodes the token", () => {
    const token = generateToken(base)
    const url = buildActionUrl(token)
    expect(url).toContain("/leave/action")
    expect(url).toContain(encodeURIComponent(token))
  })

  it("buildActionUrl appends to existing query string", () => {
    const token = generateToken(base)
    const url = buildActionUrl(token, "/foo?x=1")
    expect(url).toContain("?x=1&t=")
  })
})
