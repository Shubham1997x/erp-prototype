import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

function mapProduct(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku,
    unitOfMeasure: r.unit_of_measure,
    price: r.price,
    bomId: r.bom_id,
    currentStock: Math.max(0, r.current_stock as number),
    reservedStock: r.reserved_stock ?? 0,
    unitCost: r.unit_cost,
    standardCost: r.standard_cost,
    category: r.category,
    isActive: r.is_active === 1,
    imageUrl: r.image_url,
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    return NextResponse.json(mapProduct(product))
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  if (!auth.isAdmin && !auth.isInventory) {
    return NextResponse.json({ error: "Only inventory or admin can edit products" }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const before = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown> | undefined
  if (!before) return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const body = await req.json()
  const now = new Date().toISOString()

  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 })
  }
  if (body.price !== undefined && Number(body.price) <= 0) {
    return NextResponse.json({ error: "Price must be greater than 0" }, { status: 400 })
  }

  const name = body.name !== undefined ? String(body.name).trim() : before.name
  const sku = body.sku !== undefined ? String(body.sku).trim() || before.sku : before.sku
  const unitOfMeasure =
    body.unitOfMeasure !== undefined ? String(body.unitOfMeasure) : before.unit_of_measure
  const price = body.price !== undefined ? Number(body.price) : before.price
  const imageUrl = body.imageUrl !== undefined ? body.imageUrl : before.image_url

  const category = body.category !== undefined ? (body.category || null) : before.category
  const standardCost = body.standardCost !== undefined ? (Number(body.standardCost) || null) : before.standard_cost
  const unitCost = body.unitCost !== undefined ? (Number(body.unitCost) || null) : before.unit_cost
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : before.is_active

  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, unit_of_measure = ?, price = ?, image_url = ?, category = ?, standard_cost = ?, unit_cost = ?, is_active = ?
    WHERE id = ?
  `).run(name, sku, unitOfMeasure, price, imageUrl, category, standardCost, unitCost, isActive, id)

  const after = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown>

  writeAuditLog(db, {
    userId: auth.id,
    action: "PRODUCT_UPDATED",
    entityType: "product",
    entityId: id,
    before: mapProduct(before),
    after: mapProduct(after),
  })

  return NextResponse.json(mapProduct(after))
}
