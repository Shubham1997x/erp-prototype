import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, checkReplenishment } from "@/lib/audit"

export const dynamic = "force-dynamic"

/**
 * POST /api/purchase-orders/[id]/receive
 *
 * Body: { lines: [{ lineId: number, receivedQty: number }] }
 *
 * Supports partial receipts — call multiple times until all lines are received.
 * Status becomes PARTIALLY_RECEIVED if some lines still outstanding, RECEIVED when all done.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/purchase-orders/[id]/receive">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json()
  const db     = getDb()
  const now    = new Date().toISOString()

  // Body can contain explicit per-line receipts OR default to "receive all remaining"
  const lineReceipts: { lineId: number; receivedQty: number }[] = body.lines ?? []

  try {
    const result = db.transaction(() => {
      const po = db.prepare("SELECT * FROM purchase_orders WHERE id=?").get(id) as
        { status: string } | undefined
      if (!po) throw new Error("Purchase order not found")
      if (po.status === "RECEIVED" || po.status === "CANCELLED") {
        throw new Error(`PO is already ${po.status}`)
      }

      const allLines = db.prepare("SELECT * FROM purchase_order_lines WHERE order_id=?").all(id) as
        { id: number; material_id: string; qty: number; received_qty: number; unit_price: number }[]

      // Build a map of lineId → qty to receive this call
      const receiptMap = new Map(lineReceipts.map(l => [l.lineId, l.receivedQty]))

      for (const line of allLines) {
        const toReceiveNow = receiptMap.size > 0
          ? (receiptMap.get(line.id) ?? 0)
          : (line.qty - line.received_qty)  // default: receive all remaining

        if (toReceiveNow <= 0) continue

        const remaining = line.qty - line.received_qty
        if (toReceiveNow > remaining) {
          throw new Error(`Cannot receive ${toReceiveNow} for line ${line.id}: only ${remaining} remaining`)
        }

        // Update stock
        db.prepare("UPDATE raw_materials SET current_stock = current_stock + ? WHERE id=?")
          .run(toReceiveNow, line.material_id)

        // Update weighted average cost
        const rm = db.prepare("SELECT current_stock, unit_cost FROM raw_materials WHERE id=?")
          .get(line.material_id) as { current_stock: number; unit_cost: number } | undefined
        if (rm && line.unit_price > 0) {
          const oldStock = (rm.current_stock - toReceiveNow)
          const newAvgCost = oldStock <= 0
            ? line.unit_price
            : ((oldStock * (rm.unit_cost || line.unit_price)) + (toReceiveNow * line.unit_price)) / rm.current_stock
          db.prepare("UPDATE raw_materials SET unit_cost=? WHERE id=?").run(newAvgCost, line.material_id)

          // Record price history
          db.prepare(`
            INSERT INTO supplier_price_history (material_id, supplier_id, unit_price, effective_from, purchase_order_id, created_at)
            SELECT ?, supplier_id, ?, ?, ?, ?
            FROM purchase_orders WHERE id=?
          `).run(line.material_id, line.unit_price, now, id, now, id)
        }

        db.prepare("UPDATE purchase_order_lines SET received_qty = received_qty + ? WHERE id=?")
          .run(toReceiveNow, line.id)

        db.prepare(`
          INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
          VALUES ('raw_material', ?, ?, ?, 'purchase_order', ?, ?, ?)
        `).run(line.material_id, toReceiveNow, `PO ${id} — Goods Receipt`, id, auth.id, now)
      }

      // Recompute PO status
      const updatedLines = db.prepare("SELECT qty, received_qty FROM purchase_order_lines WHERE order_id=?").all(id) as
        { qty: number; received_qty: number }[]

      const allReceived = updatedLines.every(l => l.received_qty >= l.qty)
      const anyReceived = updatedLines.some(l => l.received_qty > 0)
      const newStatus   = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status

      db.prepare("UPDATE purchase_orders SET status=?, updated_at=?, updated_by=? WHERE id=?")
        .run(newStatus, now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id, action: "PO_RECEIVED",
        entityType: "purchase_order", entityId: id,
        after: { status: newStatus, linesReceived: allLines.length },
      })

      // Trigger replenishment check — receiving stock may clear some suggestions
      checkReplenishment(db)

      return { id, status: newStatus }
    })()

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
