import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrich(r: Record<string, unknown>) {
  return {
    id: r.id, salesOrderId: r.sales_order_id, productId: r.product_id,
    qty: r.qty, status: r.status, bomId: r.bom_id, notes: r.notes,
    createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
    plannedStart: r.planned_start, plannedEnd: r.planned_end,
    actualStart: r.actual_start, actualEnd: r.actual_end,
    workCenterId: r.work_center_id,
    producedQty: r.produced_qty ?? 0, scrappedQty: r.scrapped_qty ?? 0,
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "100"))
  const offset = (page - 1) * limit

  const total = (db.prepare("SELECT COUNT(*) as n FROM production_orders").get() as { n: number }).n
  const rows  = db.prepare("SELECT * FROM production_orders ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(enrich), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const db   = getDb()
  const id   = newId("prod")  // prod- prefix, no collision with purchase orders
  const now  = new Date().toISOString()

  if (!body.productId || !body.qty || body.qty <= 0) {
    return NextResponse.json({ error: "productId and qty > 0 are required" }, { status: 400 })
  }

  db.prepare(`
    INSERT INTO production_orders (id, sales_order_id, product_id, qty, status, bom_id, notes, created_at, updated_at)
    VALUES (?,?,?,?,'PLANNED',?,?,?,?)
  `).run(id, body.salesOrderId ?? null, body.productId, body.qty, body.bomId, body.notes ?? null, now, now)

  writeAuditLog(db, {
    userId: auth.id,
    action: "PROD_CREATED",
    entityType: "production_order",
    entityId: id,
    after: { productId: body.productId, qty: body.qty, bomId: body.bomId },
  })

  return NextResponse.json({ id, status: "PLANNED" }, { status: 201 })
}
