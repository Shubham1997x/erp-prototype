import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const db = getDb()
  const rows = db.prepare("SELECT * FROM users ORDER BY name ASC").all()
  return NextResponse.json(rows)
}
