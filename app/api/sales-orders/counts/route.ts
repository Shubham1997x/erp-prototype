import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM sales_orders GROUP BY status").all() as { status: string, count: number }[]
  
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.status] = row.count
  }

  return NextResponse.json(counts)
}
