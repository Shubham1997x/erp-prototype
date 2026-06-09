import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
import { verifyPassword } from "@/lib/core"
import { createSession, getSessionCookieOptions } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, role, password_hash")
    .eq("email", email)
    .eq("status", "Active")
    .single()

  if (!user || !user.password_hash || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? undefined
  const sessionId = await createSession(user.id, ip)

  await supabase.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id)

  await writeAuditLog({
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
