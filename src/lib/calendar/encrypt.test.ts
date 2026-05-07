import { describe, it, expect } from "vitest"
import { encryptToken, decryptToken } from "./encrypt"

describe("calendar/encrypt", () => {
  it("round-trips arbitrary plaintext", () => {
    const pt = `{"access_token":"ya29.abc","refresh_token":"1//0g","expiry_date":1788000000000}`
    const ct = encryptToken(pt)
    expect(ct).not.toBe(pt)
    expect(decryptToken(ct)).toBe(pt)
  })

  it("two encryptions of the same plaintext differ (random IV)", () => {
    const pt = "hello world"
    expect(encryptToken(pt)).not.toBe(encryptToken(pt))
  })

  it("decrypt throws on tampered ciphertext (auth tag failure)", () => {
    const ct = encryptToken("payload")
    // Flip a byte in the middle of the base64 — auth tag must reject it.
    const buf = Buffer.from(ct, "base64")
    buf[10] ^= 0xff
    expect(() => decryptToken(buf.toString("base64"))).toThrow()
  })

  it("decrypt throws on truncated input", () => {
    expect(() => decryptToken("ZZ")).toThrow()
    expect(() => decryptToken("")).toThrow()
  })
})
