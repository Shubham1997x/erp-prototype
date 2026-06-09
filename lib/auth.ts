import { cookies } from "next/headers"
import { getSupabase } from "./supabase"
import type { UserRole } from "./types"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  isAdmin: boolean
  isSales: boolean
  isInventory: boolean
}

const SESSION_COOKIE = "erp_session"
const SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

export async function getAuth(req: Request): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value

  if (sessionId) {
    const supabase = getSupabase()
    const now = new Date().toISOString()

    const { data: session } = await supabase
      .from("sessions")
      .select("user_id")
      .eq("id", sessionId)
      .gt("expires_at", now)
      .single()

    if (session) {
      const { data: user } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("id", session.user_id)
        .eq("status", "Active")
        .single()

      if (user) {
        const newExpiry = new Date(Date.now() + SESSION_TTL_MS).toISOString()
        await supabase.from("sessions").update({ expires_at: newExpiry }).eq("id", sessionId)
        return buildAuthUser(user.id, user.name, user.email, user.role as UserRole)
      }
    }
  }

  // Dev header fallback — validated against DB, not blindly trusted
  const headerId = req.headers.get("X-User-Id")
  const headerRole = req.headers.get("X-User-Role") as UserRole | null

  if (headerId && headerRole) {
    const { data: u } = await getSupabase()
      .from("users")
      .select("id, name, email, role")
      .eq("id", headerId)
      .eq("status", "Active")
      .single()
    if (u && u.role === headerRole) {
      return buildAuthUser(u.id, u.name, u.email, u.role as UserRole)
    }
  }

  return null
}

function buildAuthUser(id: string, name: string, email: string, role: UserRole): AuthUser {
  return {
    id,
    name,
    email,
    role,
    isAdmin: role === "Admin",
    isSales: role === "Sales Executive" || role === "Admin",
    isInventory: role === "Inventory Manager" || role === "Admin",
  }
}

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
  return await requireAuth(req)
}

export async function createSession(userId: string, ipAddress?: string): Promise<string> {
  const id = `sess-${crypto.randomUUID().replace(/-/g, "")}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await getSupabase()
    .from("sessions")
    .insert({ id, user_id: userId, expires_at: expiresAt, ip_address: ipAddress ?? null })
  return id
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await getSupabase().from("sessions").delete().eq("id", sessionId)
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await getSupabase().from("sessions").delete().eq("user_id", userId)
}

export function getSessionCookieOptions(expires = false) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: expires ? 0 : SESSION_TTL_MS / 1000,
  }
}
