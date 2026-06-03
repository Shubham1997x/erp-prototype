import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"
import { newId } from "@/lib/utils"
import { SO_TRANSITIONS } from "@/lib/types"
import type { SalesOrderStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, ctx: RouteContext<"/api/sales-orders/[id]/status">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { status, promisedDeliveryDate } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  try {
    const result = db.transaction(() => {
      const order = db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as
        Record<string, unknown> | undefined
      if (!order) throw new Error("Sales order not found")

      const current = order.status as SalesOrderStatus

      // ── Transition guard ───────────────────────────────────────────────────
      const allowed = SO_TRANSITIONS[current] ?? []
      if (!allowed.includes(status as SalesOrderStatus)) {
        throw new Error(`Invalid transition: ${current} → ${status}. Allowed: ${allowed.join(", ") || "none"}`)
      }

      // ── APPROVED: reserve finished goods ──────────────────────────────────
      if (status === "APPROVED") {
        const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(id) as
          { product_id: string; qty: number }[]

        for (const line of lines) {
          const existingRes = db.prepare(
            "SELECT id FROM inventory_reservations WHERE reference_id=? AND entity_id=? AND is_active=1"
          ).get(id, line.product_id)
          if (existingRes) continue

          const resId = newId("res")
          db.prepare(`
            INSERT INTO inventory_reservations
              (id, entity_type, entity_id, reserved_qty, reservation_type, reference_id, reference_type, created_by)
            VALUES (?, 'product', ?, ?, 'sales_order', ?, 'sales_order', ?)
          `).run(resId, line.product_id, line.qty, id, auth.id)

          db.prepare("UPDATE products SET reserved_stock = reserved_stock + ? WHERE id=?")
            .run(line.qty, line.product_id)
        }

        createNotification(db, {
          role: "Production Manager",
          type: "SO_APPROVED",
          title: `Sales Order ${id} approved`,
          message: `SO ${id} is ready for production planning.`,
          entityType: "sales_order",
          entityId: id,
        })
      }

      // ── READY_TO_SHIP: validate stock is available (no deduction here) ────
      if (status === "READY_TO_SHIP") {
        const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(id) as
          { product_id: string; qty: number }[]

        for (const line of lines) {
          const product = db.prepare("SELECT name, current_stock FROM products WHERE id=?").get(line.product_id) as
            { name: string; current_stock: number } | undefined
          if (!product) throw new Error(`Product not found: ${line.product_id}`)
          if (product.current_stock < line.qty) {
            throw new Error(
              `Insufficient stock for "${product.name}". Required: ${line.qty}, Available: ${product.current_stock}`
            )
          }
        }
        createNotification(db, {
          role: "Inventory Manager",
          type: "READY_TO_SHIP",
          title: `${id} ready to ship`,
          message: `Sales order ${id} is ready for shipment dispatch.`,
          entityType: "sales_order",
          entityId: id,
        })
      }

      // ── IN_PRODUCTION: auto-create production orders ──────────────────────
      if (status === "IN_PRODUCTION") {
        const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(id) as
          { product_id: string; qty: number }[]

        for (const line of lines) {
          const product = db.prepare("SELECT bom_id FROM products WHERE id=?").get(line.product_id) as
            { bom_id: string | null } | undefined
          if (!product) continue

          let bomId = product.bom_id
          if (!bomId) {
            const active = db.prepare("SELECT id FROM boms WHERE product_id=? AND status='ACTIVE' LIMIT 1")
              .get(line.product_id) as { id: string } | undefined
            bomId = active?.id ?? null
          }
          if (!bomId) {
            const any = db.prepare("SELECT id FROM boms WHERE product_id=? LIMIT 1")
              .get(line.product_id) as { id: string } | undefined
            bomId = any?.id ?? null
          }

          if (bomId) {
            const exists = db.prepare(
              "SELECT id FROM production_orders WHERE sales_order_id=? AND product_id=?"
            ).get(id, line.product_id)

            if (!exists) {
              const poId = newId("prod")
              db.prepare(`
                INSERT INTO production_orders
                  (id, sales_order_id, product_id, qty, status, bom_id, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?)
              `).run(poId, id, line.product_id, line.qty, bomId, `Auto-created from ${id}`, now, now)
            }
          }
        }
      }

      if (promisedDeliveryDate) {
        db.prepare("UPDATE sales_orders SET promised_delivery_date=? WHERE id=?")
          .run(promisedDeliveryDate, id)
      }

      db.prepare("UPDATE sales_orders SET status=?, updated_at=?, updated_by=? WHERE id=?")
        .run(status, now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: `SO_STATUS_${status}`,
        entityType: "sales_order",
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
