import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM products ORDER BY name ASC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku, unitOfMeasure: r.unit_of_measure,
    price: r.price, bomId: r.bom_id, currentStock: Math.max(0, r.current_stock as number),
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
    // Assign default image if not provided — picks from curated Unsplash shirt photos
    const defaultImages = [
      "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1618517351616-38fb9c5210c6?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1614944848172-4e0d0e8b4e25?w=600&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1625910513956-7a2f3e6e48a7?w=600&auto=format&fit=crop",
    ]
    const finalImageUrl = body.imageUrl || defaultImages[Math.floor(Math.random() * defaultImages.length)]

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
