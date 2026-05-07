// Loaded before each test run. Defines deterministic env vars so token
// signing / time-sensitive logic doesn't depend on the developer's .env.

process.env.EMAIL_TOKEN_SECRET ||= "test-secret-key-32chars-test-secret-key"
process.env.EMAIL_TOKEN_TTL_HOURS ||= "72"
process.env.APP_BASE_URL ||= "http://test.local"

// The Prisma client is constructed at module-load time inside src/lib/prisma.ts.
// We never actually query in unit tests — the dummy URL is just to satisfy
// the constructor.
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test"
