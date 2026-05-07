/**
 * Email action tokens.
 *
 * Tokens are signed (HMAC-SHA256), single-use, time-limited blobs embedded
 * in email links so a recipient can approve / reject / agree / disagree
 * directly from their inbox without logging in.
 *
 * Format on the wire: base64url(JSON-payload).base64url(hmac-sha256-signature)
 *
 * Single-use semantics are enforced by the route handler — when a token is
 * consumed, the corresponding `LeaveEmailEvent.tokenUsedAt` is set to now and
 * `actionTaken` is recorded. Any subsequent presentation of the same token
 * must be rejected.
 *
 * Never log the raw token. The signature acts as a bearer credential.
 */

import { createHmac, timingSafeEqual } from "node:crypto"

export type TokenAction =
  | "APPROVE_LEAVE"
  | "REJECT_LEAVE"
  | "AGREE_PROPOSAL"
  | "DISAGREE_PROPOSAL"
  | "APPROVE_OVERTIME"
  | "REJECT_OVERTIME"
  | "CALENDAR_FEED" // long-lived bearer for personal .ics subscription URLs

export type ResourceType = "LEAVE" | "PROPOSAL" | "OVERTIME"

export interface ActionToken {
  action: TokenAction
  resourceId: string
  resourceType: ResourceType
  /** The user this token authorises — usually the recipient of the email. */
  userId: string
  /** Unix epoch (ms) at which the token must no longer be honoured. */
  expiresAt: number
  /** Random nonce so two tokens for the same action aren't identical. */
  nonce: string
}

const SECRET_ENV = "EMAIL_TOKEN_SECRET"
const TTL_ENV = "EMAIL_TOKEN_TTL_HOURS"
const DEFAULT_TTL_HOURS = 72

function getSecret(): string {
  const secret = process.env[SECRET_ENV]
  if (!secret || secret.length < 32) {
    throw new Error(
      `${SECRET_ENV} is missing or too short (need ≥32 chars). Set a strong random value in .env.`
    )
  }
  return secret
}

function getTtlMs(): number {
  const raw = process.env[TTL_ENV]
  const hours = raw ? Number(raw) : DEFAULT_TTL_HOURS
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_HOURS * 3600_000
  return hours * 3600_000
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64")
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", getSecret()).update(payload).digest())
}

function randomNonce(): string {
  // 16 bytes of randomness is plenty; we just want uniqueness, not secrecy.
  const bytes = new Uint8Array(16)
  // Node's webcrypto is universally available on the runtimes we target.
  globalThis.crypto.getRandomValues(bytes)
  return b64url(Buffer.from(bytes))
}

/** Build a freshly-signed token. Caller usually defaults expiry to now+TTL. */
export function generateToken(
  partial: Omit<ActionToken, "expiresAt" | "nonce"> & {
    expiresAt?: number
    nonce?: string
  }
): string {
  const token: ActionToken = {
    ...partial,
    expiresAt: partial.expiresAt ?? Date.now() + getTtlMs(),
    nonce: partial.nonce ?? randomNonce(),
  }
  const payload = b64url(JSON.stringify(token))
  const sig = sign(payload)
  return `${payload}.${sig}`
}

/**
 * Verify a token's signature, structure, and expiry. Returns the decoded
 * token, or `null` if anything is wrong. Never throws on bad input.
 *
 * Note: this does NOT enforce single-use. The caller must check the
 * corresponding `LeaveEmailEvent.tokenUsedAt` before honouring the action.
 */
export function verifyToken(raw: string): ActionToken | null {
  if (typeof raw !== "string" || !raw.includes(".")) return null
  const [payload, sig] = raw.split(".", 2)
  if (!payload || !sig) return null

  let expectedSig: string
  try {
    expectedSig = sign(payload)
  } catch {
    return null
  }
  // Constant-time comparison to avoid timing attacks.
  const a = Buffer.from(sig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let decoded: unknown
  try {
    decoded = JSON.parse(b64urlDecode(payload).toString("utf8"))
  } catch {
    return null
  }
  if (!isActionToken(decoded)) return null
  if (decoded.expiresAt < Date.now()) return null
  return decoded
}

function isActionToken(v: unknown): v is ActionToken {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.action === "string" &&
    typeof o.resourceId === "string" &&
    typeof o.resourceType === "string" &&
    typeof o.userId === "string" &&
    typeof o.expiresAt === "number" &&
    typeof o.nonce === "string"
  )
}

/**
 * Build the absolute URL the user clicks in the email. The path defaults to
 * the public token-action page; callers can override for non-leave flows.
 */
export function buildActionUrl(token: string, path: string = "/leave/action"): string {
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  const sep = path.includes("?") ? "&" : "?"
  return `${base}${path}${sep}t=${encodeURIComponent(token)}`
}
