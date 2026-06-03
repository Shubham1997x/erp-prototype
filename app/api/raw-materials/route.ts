import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM raw_materials ORDER BY name ASC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map((r) => ({
    id: r.id, name: r.name, unit: r.unit,
    currentStock: r.current_stock, reorderPoint: r.reorder_point, supplierId: r.supplier_id,
  })))
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = getDb()
  const nowStr = new Date().toISOString()
  const materialId = `rm-${Date.now()}`

  const createTransaction = db.transaction(() => {
    // 1. Create Raw Material
    db.prepare(`
      INSERT INTO raw_materials (id, name, unit, current_stock, reorder_point, supplier_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      materialId,
      body.name,
      body.unit ?? "pcs",
      body.startingStock ?? 0,
      body.reorderPoint ?? 100,
      body.supplierId || null
    )

    // 2. Create initial stock movement log if startingStock > 0
    if (body.startingStock && body.startingStock > 0) {
      db.prepare(`
        INSERT INTO stock_movements (entity_type, entity_id, delta, reason, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("raw_material", materialId, body.startingStock, "Initial Stock Receipt", "System", nowStr)
    }
  })

  createTransaction()

  const created = db.prepare("SELECT * FROM raw_materials WHERE id=?").get(materialId) as Record<string, unknown>
  return NextResponse.json({
    id: created.id,
    name: created.name,
    unit: created.unit,
    currentStock: created.current_stock,
    reorderPoint: created.reorder_point,
    supplierId: created.supplier_id,
  }, { status: 201 })
}
