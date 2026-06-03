import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"

export const dynamic = "force-dynamic"

const CANCELLABLE_FROM = ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "CREDIT_HOLD", "APPROVED", "IN_PRODUCTION"]

export async function POST(req: Request, ctx: RouteContext<"/api/sales-orders/[id]/cancel">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { reason } = await req.json().catch(() => ({ reason: null }))
  const db  = getDb()
  const now = new Date().toISOString()

  try {
    db.transaction(() => {
      const order = db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as
        Record<string, unknown> | undefined
      if (!order) throw new Error("Sales order not found")

      if (!CANCELLABLE_FROM.includes(order.status as string)) {
        throw new Error(
          `Cannot cancel order in status '${order.status}'. Only orders in ${CANCELLABLE_FROM.join(", ")} can be cancelled.`
        )
      }

      // 1. Release finished goods reservations
      const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(id) as
        { product_id: string; qty: number }[]

      for (const line of lines) {
        const activeRes = db.prepare(`
          SELECT SUM(reserved_qty) as total FROM inventory_reservations
          WHERE reference_id=? AND entity_id=? AND is_active=1
        `).get(id, line.product_id) as { total: number | null }

        const toRelease = activeRes.total ?? 0
        if (toRelease > 0) {
          db.prepare("UPDATE products SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id=?")
            .run(toRelease, line.product_id)
          db.prepare(`
            UPDATE inventory_reservations SET is_active=0, released_at=?
            WHERE reference_id=? AND entity_id=? AND is_active=1
          `).run(now, id, line.product_id)
        }
      }

      // 2. Cancel all linked production orders that haven't started production
      const linkedPOs = db.prepare(`
        SELECT id, status, bom_id, qty FROM production_orders
        WHERE sales_order_id=? AND status NOT IN ('COMPLETED','CANCELLED')
      `).all(id) as { id: string; status: string; bom_id: string; qty: number }[]

      for (const po of linkedPOs) {
        // Release raw material reservations if materials were reserved
        if (po.status === "MATERIAL_RESERVED" || po.status === "IN_PROGRESS") {
          const comps = db.prepare("SELECT * FROM bom_components WHERE bom_id=?")
            .all(po.bom_id) as { material_id: string; qty_per_unit: number }[]

          for (const comp of comps) {
            const needed = comp.qty_per_unit * po.qty
            db.prepare("UPDATE raw_materials SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id=?")
              .run(needed, comp.material_id)
            db.prepare(`
              UPDATE inventory_reservations SET is_active=0, released_at=?
              WHERE reference_id=? AND entity_id=? AND is_active=1
            `).run(now, po.id, comp.material_id)
          }
        }

        db.prepare("UPDATE production_orders SET status='CANCELLED', updated_at=?, updated_by=? WHERE id=?")
          .run(now, auth.id, po.id)

        writeAuditLog(db, {
          userId: auth.id, action: "PROD_CANCELLED",
          entityType: "production_order", entityId: po.id,
          details: `Cancelled as part of SO ${id} cancellation`,
        })
      }

      // 3. Cancel sales order
      db.prepare("UPDATE sales_orders SET status='CANCELLED', updated_at=?, updated_by=? WHERE id=?")
        .run(now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id, action: "SO_CANCELLED",
        entityType: "sales_order", entityId: id,
        before: { status: order.status },
        after:  { status: "CANCELLED" },
        details: reason ?? "No reason provided",
      })

      createNotification(db, {
        role: "Production Manager",
        type: "SO_CANCELLED",
        title: `Sales Order ${id} cancelled`,
        message: `SO ${id} was cancelled. ${linkedPOs.length} production order(s) also cancelled and reservations released.`,
        entityType: "sales_order",
        entityId: id,
      })
    })()

    return NextResponse.json({ id, status: "CANCELLED", cancelledAt: now })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
