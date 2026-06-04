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
  const rows = db.prepare(`
    SELECT 
      sm.id,
      sm.entity_type as entityType,
      sm.entity_id as entityId,
      sm.delta,
      sm.reason,
      sm.created_by as createdBy,
      sm.created_at as createdAt,
      COALESCE(rm.name, p.name) as entityName
    FROM stock_movements sm
    LEFT JOIN raw_materials rm ON sm.entity_type = 'raw_material' AND sm.entity_id = rm.id
    LEFT JOIN products p ON sm.entity_type = 'product' AND sm.entity_id = p.id
    ORDER BY sm.created_at DESC
  `).all() as Record<string, unknown>[]
  
  return NextResponse.json(rows)
}
