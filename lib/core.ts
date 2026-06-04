import crypto from "crypto"

// ─── ID generation ─────────────────────────────────────────────────────────────
// Collision-safe UUIDs for all entity IDs.
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
}

// Human-readable sequential IDs using a DB sequence table.
// Falls back to UUID-based if the DB is unavailable (e.g. during tests).
export function newSeqId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

// ─── Password hashing (PBKDF2 via built-in crypto) ────────────────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha256").toString("hex")
  return `pbkdf2:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":")
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false
  const [, salt, expectedHash] = parts
  const computed = crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha256").toString("hex")
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHash))
}

// ─── Currency formatting ───────────────────────────────────────────────────────
export function fmtCurrency(n: number, locale = "en-IN", currency = "INR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n)
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function isOverdue(dueDateStr: string): boolean {
  return new Date(dueDateStr) < new Date()
}
