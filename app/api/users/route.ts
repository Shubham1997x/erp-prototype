import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM users ORDER BY name ASC").all()
  return NextResponse.json(rows)
}
