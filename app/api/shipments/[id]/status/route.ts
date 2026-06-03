import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"
import { SHIPMENT_TRANSITIONS } from "@/lib/types"
import type { ShipmentStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, ctx: RouteContext<"/api/shipments/[id]/status">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { status, trackingNumber, carrier } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  try {
    const result = db.transaction(() => {
      const shp = db.prepare("SELECT * FROM shipments WHERE id=?").get(id) as
        { sales_order_id: string | null; status: ShipmentStatus } | undefined
      if (!shp) throw new Error("Shipment not found")

      const current = shp.status

      // ── Transition guard ─────────────────────────────────────────────────
      const allowed = SHIPMENT_TRANSITIONS[current] ?? []
      if (!allowed.includes(status as ShipmentStatus)) {
        throw new Error(`Invalid transition: ${current} → ${status}. Allowed: ${allowed.join(", ") || "none"}`)
      }

      // ── DISPATCHED: deduct finished goods stock (single authoritative point)
      if (status === "DISPATCHED" && shp.sales_order_id) {
        const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?")
          .all(shp.sales_order_id) as { product_id: string; qty: number }[]

        for (const line of lines) {
          const product = db.prepare("SELECT name, current_stock, reserved_stock FROM products WHERE id=?")
            .get(line.product_id) as { name: string; current_stock: number; reserved_stock: number } | undefined
          if (!product) throw new Error("Product not found")
          if (product.current_stock < line.qty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Required: ${line.qty}, Available: ${product.current_stock}`
            )
          }

          db.prepare(`
            UPDATE products
            SET current_stock  = current_stock  - ?,
                reserved_stock = MAX(0, reserved_stock - ?)
            WHERE id=?
          `).run(line.qty, line.qty, line.product_id)

          // Release inventory reservation for this SO
          db.prepare(`
            UPDATE inventory_reservations
            SET is_active=0, released_at=?
            WHERE reference_id=? AND entity_id=? AND is_active=1
          `).run(now, shp.sales_order_id, line.product_id)

          db.prepare(`
            INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
            VALUES ('product', ?, ?, ?, 'shipment', ?, ?, ?)
          `).run(line.product_id, -line.qty, `Shipment ${id} — Dispatch`, id, auth.id, now)
        }
      }

      // ── CANCELLED from dispatched states: restore stock ───────────────────
      // NOTE: DELIVERED is now terminal — cancel from DELIVERED is blocked by transition guard.
      if (status === "CANCELLED" && ["DISPATCHED", "IN_TRANSIT"].includes(current) && shp.sales_order_id) {
        const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?")
          .all(shp.sales_order_id) as { product_id: string; qty: number }[]

        for (const line of lines) {
          db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?")
            .run(line.qty, line.product_id)
          db.prepare(`
            INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
            VALUES ('product', ?, ?, ?, 'shipment', ?, ?, ?)
          `).run(line.product_id, line.qty, `Shipment ${id} Cancelled — Stock Restored`, id, auth.id, now)
        }
      }

      db.prepare(`
        UPDATE shipments
        SET status=?, tracking_number=COALESCE(?,tracking_number), carrier=COALESCE(?,carrier), updated_at=?
        WHERE id=?
      `).run(status, trackingNumber ?? null, carrier ?? null, now, id)

      // ── Cascade to sales order ─────────────────────────────────────────────
      if (shp.sales_order_id) {
        const soStatus =
          status === "DELIVERED"                            ? "DELIVERED" :
          ["DISPATCHED", "IN_TRANSIT"].includes(status)    ? "SHIPPED"   :
          status === "CANCELLED"                            ? "READY_TO_SHIP" :
          null

        if (soStatus) {
          db.prepare("UPDATE sales_orders SET status=?, updated_at=?, updated_by=? WHERE id=?")
            .run(soStatus, now, auth.id, shp.sales_order_id)
        }

        if (status === "DELIVERED") {
          db.prepare("UPDATE sales_orders SET actual_delivery_date=? WHERE id=?")
            .run(now, shp.sales_order_id)

          createNotification(db, {
            role: "Finance Manager",
            type: "SHIPMENT_DELIVERED",
            title: `Shipment ${id} delivered`,
            message: `Sales order ${shp.sales_order_id} has been delivered. Ready for invoicing.`,
            entityType: "shipment",
            entityId: id,
          })
        }
      }

      writeAuditLog(db, {
        userId: auth.id,
        action: `SHIPMENT_STATUS_${status}`,
        entityType: "shipment",
        entityId: id,
        before: { status: current },
        after:  { status },
      })

      return { id, status, updatedAt: now }
    })()

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
