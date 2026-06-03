import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { invalidateSession, getSessionCookieOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get("erp_session")?.value
  if (sessionId) invalidateSession(sessionId)

  const res = NextResponse.json({ ok: true })
  res.cookies.set({ ...getSessionCookieOptions(true), value: "" })
  return res
}
