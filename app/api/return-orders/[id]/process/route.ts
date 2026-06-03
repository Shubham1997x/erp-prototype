import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const ro = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as
    { id: string; status: string } | undefined
  if (!ro) return NextResponse.json({ error: "Return order not found" }, { status: 404 })
  if (!["GOODS_RECEIVED", "QC_INSPECTION"].includes(ro.status)) {
    return NextResponse.json(
      { error: `Cannot process disposition for return order in ${ro.status} status` },
      { status: 409 }
    )
  }

  const body = await req.json()
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 })
  }

  const VALID_DISPOSITIONS = ["RESTOCK", "SCRAP", "REWORK"]
  for (const l of body.lines) {
    if (!VALID_DISPOSITIONS.includes(l.disposition)) {
      return NextResponse.json(
        { error: `Invalid disposition '${l.disposition}'. Must be RESTOCK, SCRAP, or REWORK` },
        { status: 400 }
      )
    }
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    for (const line of body.lines) {
      const { lineId, disposition } = line
      if (!lineId || !disposition) continue

      const rolRow = db.prepare(
        "SELECT * FROM return_order_lines WHERE id=? AND return_order_id=?"
      ).get(lineId, id) as { id: number; product_id: string; received_qty: number; qty: number } | undefined
      if (!rolRow) continue

      const qty = rolRow.received_qty || rolRow.qty

      db.prepare(
        "UPDATE return_order_lines SET disposition=? WHERE id=?"
      ).run(disposition, lineId)

      if (disposition === "RESTOCK") {
        // Add back to product stock
        db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?")
          .run(qty, rolRow.product_id)

        db.prepare(`
          INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
          VALUES ('product',?,?,?,?,?,?,?)
        `).run(rolRow.product_id, qty, "Return order restock", "return_order", id, auth.id, now)
      } else if (disposition === "SCRAP") {
        // Create scrap order
        const scrapId = newId("scrap")
        db.prepare(`
          INSERT INTO scrap_orders (id, product_id, qty_scrapped, scrap_reason, disposed_by, disposed_at, created_by, created_at)
          VALUES (?,?,?,?,?,?,?,?)
        `).run(scrapId, rolRow.product_id, qty, "Return order scrap", auth.id, now, auth.id, now)
      }
      // REWORK: no immediate stock movement — create rework order if needed
    }

    db.prepare("UPDATE return_orders SET status='COMPLETED', updated_at=? WHERE id=?").run(now, id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "RETURN_ORDER_PROCESSED",
      entityType: "return_order",
      entityId: id,
      after: { status: "COMPLETED", linesProcessed: body.lines.length },
    })
  })()

  const lines = db.prepare("SELECT * FROM return_order_lines WHERE return_order_id=?").all(id) as Record<string, unknown>[]
  return NextResponse.json({
    returnOrderId: id,
    status: "COMPLETED",
    completedAt: now,
    lines: lines.map(l => ({
      id: l.id, productId: l.product_id, qty: l.qty,
      receivedQty: l.received_qty, condition: l.condition, disposition: l.disposition,
    })),
  })
}
