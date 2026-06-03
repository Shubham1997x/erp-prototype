import { cookies } from "next/headers"
import { getDb } from "./db"
import type { UserRole } from "./types"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  isAdmin: boolean
  isViewer: boolean
  isSales: boolean
  isProduction: boolean
  isInventory: boolean
  isFinance: boolean
}

const SESSION_COOKIE = "erp_session"
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

// ─── Resolve the current user from session cookie OR dev headers ───────────────
export async function getAuth(req: Request): Promise<AuthUser | null> {
  // 1. Try httpOnly session cookie (production auth)
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value

  if (sessionId) {
    const db = getDb()
    const session = db.prepare(`
      SELECT s.user_id, u.name, u.email, u.role, u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.status = 'Active'
    `).get(sessionId) as { user_id: string; name: string; email: string; role: UserRole; status: string } | undefined

    if (session) {
      // Extend session on activity
      const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString()
      db.prepare("UPDATE sessions SET expires_at=? WHERE id=?").run(newExpiry, sessionId)
      return buildAuthUser(session.user_id, session.name, session.email, session.role)
    }
  }

  // 2. Fall back to dev headers (X-User-Id / X-User-Role) when no session exists.
  //    These are validated against the DB so they can't be spoofed with a fake role.
  const headerId = req.headers.get("X-User-Id")
  const headerRole = req.headers.get("X-User-Role") as UserRole | null

  if (headerId && headerRole) {
    const db = getDb()
    const u = db.prepare("SELECT id, name, email, role FROM users WHERE id=? AND status='Active'").get(headerId) as
      | { id: string; name: string; email: string; role: UserRole }
      | undefined
    // Only trust the header role if it matches what's in the DB
    if (u && u.role === headerRole) {
      return buildAuthUser(u.id, u.name, u.email, u.role)
    }
  }

  return null
}

function buildAuthUser(id: string, name: string, email: string, role: UserRole): AuthUser {
  return {
    id, name, email, role,
    isAdmin:      role === "Admin",
    isViewer:     role === "Viewer",
    isSales:      role === "Sales Executive" || role === "Admin",
    isProduction: role === "Production Manager" || role === "Admin",
    isInventory:  role === "Inventory Manager" || role === "Admin",
    isFinance:    role === "Finance Manager"   || role === "Admin",
  }
}

// ─── Guards ──────────────────────────────────────────────────────────────────
export async function requireAuth(req: Request): Promise<AuthUser> {
  const auth = await getAuth(req)
  if (!auth) throw new Error("Unauthorized: Please log in")
  return auth
}

export async function requireRole(req: Request, allowedRoles: UserRole[]): Promise<AuthUser> {
  const auth = await requireAuth(req)
  if (!auth.isAdmin && !allowedRoles.includes(auth.role)) {
    throw new Error(`Unauthorized: Role '${auth.role}' cannot perform this action`)
  }
  return auth
}

export async function requireNotViewer(req: Request): Promise<AuthUser> {
  const auth = await requireAuth(req)
  if (auth.isViewer) throw new Error("Unauthorized: Viewers cannot perform this action")
  return auth
}

// ─── Session management ───────────────────────────────────────────────────────
export function createSession(userId: string, ipAddress?: string): string {
  const db = getDb()
  const id = `sess-${require("crypto").randomUUID().replace(/-/g, "")}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, ip_address) VALUES (?, ?, ?, ?)
  `).run(id, userId, expiresAt, ipAddress ?? null)
  return id
}

export function invalidateSession(sessionId: string) {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId)
}

export function invalidateAllUserSessions(userId: string) {
  const db = getDb()
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId)
}

export function getSessionCookieOptions(expires: boolean = false) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: expires ? 0 : SESSION_TTL_MS / 1000,
  }
}
