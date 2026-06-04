import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM products ORDER BY name ASC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku, unitOfMeasure: r.unit_of_measure,
    price: r.price, bomId: r.bom_id, currentStock: r.current_stock,
    imageUrl: r.image_url,
  })))
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = getDb()
  const nowStr = new Date().toISOString()
  const productId = `prod-${Date.now()}`
  const bomId = `bom-${Date.now()}`

  const createTransaction = db.transaction(() => {
    // Assign default image if not provided
    const randomDefaultId = Math.floor(Math.random() * 10) + 1
    const finalImageUrl = body.imageUrl || `/defaults/tshirt-${randomDefaultId}.jpg`

    // 1. Create Product
    db.prepare(`
      INSERT INTO products (id, name, sku, unit_of_measure, price, bom_id, current_stock, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      productId,
      body.name,
      body.sku ?? `SHT-${Date.now()}`,
      body.unitOfMeasure ?? "pcs",
      body.price ?? 0,
      bomId,
      body.startingStock ?? 0,
      finalImageUrl
    )

    // 2. Create default Draft BOM
    db.prepare(`
      INSERT INTO boms (id, product_id, version, status, created_by, created_at)
      VALUES (?, ?, 'v1.0', 'DRAFT', 'System', ?)
    `).run(bomId, productId, nowStr)

    // 3. Create initial stock movement log if startingStock > 0
    if (body.startingStock && body.startingStock > 0) {
      db.prepare(`
        INSERT INTO stock_movements (entity_type, entity_id, delta, reason, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("product", productId, body.startingStock, "Initial Stock Receipt", "System", nowStr)
    }
  })

  createTransaction()

  const created = db.prepare("SELECT * FROM products WHERE id=?").get(productId) as Record<string, unknown>
  return NextResponse.json({
    id: created.id,
    name: created.name,
    sku: created.sku,
    unitOfMeasure: created.unit_of_measure,
    price: created.price,
    bomId: created.bom_id,
    currentStock: created.current_stock,
    imageUrl: created.image_url,
  }, { status: 201 })
}
