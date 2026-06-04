import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { verifyPassword } from "@/lib/core"
import { createSession, getSessionCookieOptions } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
  }

  const db = getDb()
  const user = db.prepare("SELECT * FROM users WHERE email=? AND status='Active'").get(email) as
    | { id: string; name: string; email: string; role: string; password_hash: string | null }
    | undefined

  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
  const sessionId = createSession(user.id, ip)

  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id)

  writeAuditLog(db, {
    userId: user.id,
    action: "LOGIN",
    entityType: "user",
    entityId: user.id,
    details: `User ${user.email} logged in`,
    ipAddress: ip,
  })

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  })
  res.cookies.set({ ...getSessionCookieOptions(), value: sessionId })
  return res
}
