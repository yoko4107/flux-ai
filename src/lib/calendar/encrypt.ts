/**
 * Symmetric encryption for OAuth refresh / access tokens stored in
 * `CalendarToken.encryptedToken`.
 *
 * AES-256-GCM with a key derived from `CALENDAR_ENCRYPTION_KEY` (or a
 * fallback to `EMAIL_TOKEN_SECRET` so deployments that already have one
 * strong secret don't need a second one).
 *
 * Storage format: base64(iv | ciphertext | authTag), all in one string.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = process.env.CALENDAR_ENCRYPTION_KEY || process.env.EMAIL_TOKEN_SECRET
  if (!raw || raw.length < 32) {
    throw new Error(
      "CALENDAR_ENCRYPTION_KEY (or EMAIL_TOKEN_SECRET) must be set to ≥32 chars"
    )
  }
  // Derive a stable 32-byte key. SHA-256 is fine here — we're not storing
  // the key, just stretching the secret to fixed-length material.
  return createHash("sha256").update(raw).digest()
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, ct, tag]).toString("base64")
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64")
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) throw new Error("Ciphertext too short")
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(buf.length - TAG_LENGTH)
  const ct = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)
  const decipher = createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString("utf8")
}
