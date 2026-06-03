import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

function enrich(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const lines = db.prepare(
    "SELECT pll.*, p.name as product_name, p.sku FROM price_list_lines pll LEFT JOIN products p ON p.id=pll.product_id WHERE pll.price_list_id=?"
  ).all(r.id as string) as Record<string, unknown>[]
  return {
    id: r.id,
    name: r.name,
    customerId: r.customer_id,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    isActive: Boolean(r.is_active),
    createdBy: r.created_by,
    createdAt: r.created_at,
    lines: lines.map(l => ({
      id: l.id, productId: l.product_id, productName: l.product_name, sku: l.sku,
      unitPrice: l.unit_price, minQty: l.min_qty,
    })),
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const pl = db.prepare("SELECT * FROM price_lists WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!pl) return NextResponse.json({ error: "Price list not found" }, { status: 404 })
  return NextResponse.json(enrich(db, pl))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const existing = db.prepare("SELECT * FROM price_lists WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!existing) return NextResponse.json({ error: "Price list not found" }, { status: 404 })

  const body     = await req.json()
  const isActive = body.isActive  != null ? (body.isActive ? 1 : 0) : existing.is_active
  const validFrom = body.validFrom ?? existing.valid_from
  const validTo   = body.validTo   ?? existing.valid_to
  const name      = body.name      ?? existing.name

  db.transaction(() => {
    db.prepare(
      "UPDATE price_lists SET name=?, is_active=?, valid_from=?, valid_to=? WHERE id=?"
    ).run(name, isActive, validFrom, validTo, id)

    // Replace all lines if lines array is provided
    if (Array.isArray(body.lines)) {
      db.prepare("DELETE FROM price_list_lines WHERE price_list_id=?").run(id)
      for (const l of body.lines) {
        if (!l.productId || l.unitPrice == null) continue
        db.prepare(
          "INSERT INTO price_list_lines (price_list_id, product_id, unit_price, min_qty) VALUES (?,?,?,?)"
        ).run(id, l.productId, l.unitPrice, l.minQty ?? 1)
      }
    }
  })()

  const updated = db.prepare("SELECT * FROM price_lists WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, updated))
}
