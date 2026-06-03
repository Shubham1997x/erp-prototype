import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit
  const status = searchParams.get("status")

  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (status) { conditions.push("rs.status = ?"); params.push(status) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM replenishment_suggestions rs ${where}`).get(...params) as { cnt: number }).cnt

  const data = db.prepare(`
    SELECT rs.*, rm.name as material_name, rm.unit as material_unit, s.name as supplier_name
    FROM replenishment_suggestions rs
    LEFT JOIN raw_materials rm ON rm.id = rs.material_id
    LEFT JOIN suppliers s ON s.id = rs.supplier_id
    ${where}
    ORDER BY rs.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return NextResponse.json({ data, total, page, limit })
}
