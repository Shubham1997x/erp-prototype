import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function enrichBom(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const comps = db.prepare("SELECT * FROM bom_components WHERE bom_id=?").all(r.id) as Record<string, unknown>[]
  return {
    id: r.id, productId: r.product_id, version: r.version,
    status: r.status, createdBy: r.created_by, createdAt: r.created_at,
    components: comps.map((c) => ({ materialId: c.material_id, qtyPerUnit: c.qty_per_unit })),
  }
}

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM boms ORDER BY created_at DESC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map((r) => enrichBom(db, r)))
}
