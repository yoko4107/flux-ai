/**
 * Rate limiter with optional Redis/Upstash backend.
 *
 * Auto-detection priority:
 *   1. Upstash Redis REST  — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   2. Generic Redis URL   — set REDIS_URL (ioredis-compatible)
 *   3. In-memory fallback  — no config needed; works in dev / single-instance deploys.
 *      Note: in-memory limits are per-process and reset on cold starts.
 *      Use a Redis backend for multi-instance / serverless production deployments.
 *
 * Usage:
 *   const allowed = await rateLimit("send-otp:token123", 5, 15 * 60 * 1000)
 *   if (!allowed) return Response.json({ error: "Too many requests" }, { status: 429 })
 */

// ---------------------------------------------------------------------------
// In-memory fallback (with automatic stale-entry pruning)
// ---------------------------------------------------------------------------

interface Entry { count: number; resetAt: number }
const store = new Map<string, Entry>()

// Prune entries older than their window every 5 minutes to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }, 5 * 60 * 1000).unref?.()
}

function inMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

// ---------------------------------------------------------------------------
// Upstash Redis REST backend (edge-compatible, no persistent connection)
// ---------------------------------------------------------------------------

async function upstashRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL!
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!
  const windowSec = Math.ceil(windowMs / 1000)

  // Atomic INCR + EXPIRE via pipeline
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, windowSec, "NX"],
    ]),
  })

  if (!res.ok) {
    console.warn("[rate-limit] Upstash request failed, falling back to in-memory")
    return inMemoryRateLimit(key, limit, windowMs)
  }

  const [[, count]] = await res.json() as [[string, number], unknown]
  return count <= limit
}

// ---------------------------------------------------------------------------
// ioredis backend (standard Redis URL)
// ---------------------------------------------------------------------------

let redisClient: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<number> } | null = null

async function getRedisClient() {
  if (redisClient) return redisClient
  try {
    const { default: Redis } = await import("ioredis")
    const client = new Redis(process.env.REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 1 })
    await client.connect()
    redisClient = client
    return redisClient
  } catch {
    console.warn("[rate-limit] ioredis unavailable, falling back to in-memory")
    return null
  }
}

async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const client = await getRedisClient()
  if (!client) return inMemoryRateLimit(key, limit, windowMs)

  const windowSec = Math.ceil(windowMs / 1000)
  const count = await client.incr(key)
  if (count === 1) await client.expire(key, windowSec)
  return count <= limit
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashRateLimit(key, limit, windowMs)
  }
  if (process.env.REDIS_URL) {
    return redisRateLimit(key, limit, windowMs)
  }
  return inMemoryRateLimit(key, limit, windowMs)
}
