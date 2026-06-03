import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED:      ["APPROVED", "REJECTED"],
  APPROVED:       ["GOODS_RECEIVED", "REJECTED"],
  GOODS_RECEIVED: ["QC_INSPECTION"],
  QC_INSPECTION:  ["COMPLETED", "REJECTED"],
}

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const ro = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!ro) return NextResponse.json({ error: "Return order not found" }, { status: 404 })
  return NextResponse.json(enrich(db, ro))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const ro = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as
    Record<string, unknown> | undefined
  if (!ro) return NextResponse.json({ error: "Return order not found" }, { status: 404 })

  const body   = await req.json()
  const status = body.status

  if (status) {
    const allowed = VALID_TRANSITIONS[ro.status as string] ?? []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition return order from ${ro.status} to ${status}` },
        { status: 409 }
      )
    }
  }

  const now   = new Date().toISOString()
  const notes = body.notes ?? ro.notes

  db.transaction(() => {
    db.prepare(
      "UPDATE return_orders SET status=?, notes=?, updated_at=? WHERE id=?"
    ).run(status ?? ro.status, notes, now, id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "RETURN_ORDER_STATUS_UPDATED",
      entityType: "return_order",
      entityId: id,
      before: { status: ro.status },
      after:  { status: status ?? ro.status },
    })
  })()

  const updated = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, updated))
}
