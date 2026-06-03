import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

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

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page       = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit      = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"))
  const offset     = (page - 1) * limit
  const customerId = url.searchParams.get("customerId")

  let where = "WHERE 1=1"
  const params: unknown[] = []
  if (customerId) { where += " AND customer_id=?"; params.push(customerId) }

  const total = (db.prepare(`SELECT COUNT(*) as n FROM price_lists ${where}`).get(...params) as { n: number }).n
  const rows  = db.prepare(`SELECT * FROM price_lists ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(r => enrich(db, r)), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const db  = getDb()
  const id  = newId("pl")
  const now = new Date().toISOString()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO price_lists (id, name, customer_id, valid_from, valid_to, is_active, created_by, created_at)
      VALUES (?,?,?,?,?,1,?,?)
    `).run(id, body.name, body.customerId ?? null, body.validFrom ?? null, body.validTo ?? null, auth.id, now)

    if (Array.isArray(body.lines)) {
      for (const l of body.lines) {
        if (!l.productId || l.unitPrice == null) continue
        db.prepare(
          "INSERT INTO price_list_lines (price_list_id, product_id, unit_price, min_qty) VALUES (?,?,?,?)"
        ).run(id, l.productId, l.unitPrice, l.minQty ?? 1)
      }
    }
  })()

  const created = db.prepare("SELECT * FROM price_lists WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, created), { status: 201 })
}
