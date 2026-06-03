import { NextResponse } from "next/server"
import { getAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (!auth) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({
    user: { id: auth.id, name: auth.name, email: auth.email, role: auth.role },
  })
}
