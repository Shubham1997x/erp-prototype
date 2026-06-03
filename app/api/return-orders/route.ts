import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrich(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const lines = db.prepare(`
    SELECT rol.*, p.name as product_name, p.sku
    FROM return_order_lines rol
    LEFT JOIN products p ON p.id = rol.product_id
    WHERE rol.return_order_id = ?
  `).all(r.id as string) as Record<string, unknown>[]

  return {
    id: r.id,
    salesOrderId: r.sales_order_id,
    shipmentId: r.shipment_id,
    customerId: r.customer_id,
    status: r.status,
    returnReason: r.return_reason,
    returnType: r.return_type,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lines: lines.map(l => ({
      id: l.id, productId: l.product_id, productName: l.product_name, sku: l.sku,
      qty: l.qty, receivedQty: l.received_qty, condition: l.condition, disposition: l.disposition,
    })),
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page       = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit      = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"))
  const offset     = (page - 1) * limit
  const status     = url.searchParams.get("status")
  const customerId = url.searchParams.get("customerId")

  let where = "WHERE 1=1"
  const params: unknown[] = []
  if (status)     { where += " AND status=?";      params.push(status) }
  if (customerId) { where += " AND customer_id=?"; params.push(customerId) }

  const total = (db.prepare(`SELECT COUNT(*) as n FROM return_orders ${where}`).get(...params) as { n: number }).n
  const rows  = db.prepare(`SELECT * FROM return_orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(r => enrich(db, r)), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.customerId) return NextResponse.json({ error: "customerId is required" }, { status: 400 })
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "At least one line is required" }, { status: 400 })
  }

  const db  = getDb()
  const id  = newId("ro")
  const now = new Date().toISOString()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO return_orders
        (id, sales_order_id, shipment_id, customer_id, status, return_reason, return_type, notes, created_by, created_at, updated_at)
      VALUES (?,?,?,?,'REQUESTED',?,?,?,?,?,?)
    `).run(
      id,
      body.salesOrderId ?? null,
      body.shipmentId   ?? null,
      body.customerId,
      body.returnReason ?? null,
      body.returnType   ?? "CUSTOMER_RETURN",
      body.notes        ?? null,
      auth.id,
      now, now
    )

    for (const l of body.lines) {
      if (!l.productId || !l.qty) continue
      db.prepare(
        "INSERT INTO return_order_lines (return_order_id, product_id, qty, received_qty, condition, disposition) VALUES (?,?,?,0,'UNKNOWN','PENDING')"
      ).run(id, l.productId, l.qty)
    }
  })()

  const created = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, created), { status: 201 })
}
