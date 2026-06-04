import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales-orders/[id]/fulfill
 *
 * Simplified fulfill action for the new order flow:
 * 1. Checks stock for all lines
 * 2. If sufficient: deducts stock, sets order to DELIVERED
 * 3. If insufficient: sets order to NEEDS_RESTOCK and returns shortage info
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/sales-orders/[id]/fulfill">
) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const db = getDb()
  const now = new Date().toISOString()

  try {
    const result = db.transaction(() => {
      const order = db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as
        Record<string, unknown> | undefined
      if (!order) throw new Error("Sales order not found")

      const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(id) as
        { product_id: string; qty: number }[]

      // Check stock for all lines
      const shortages: { productId: string; name: string; required: number; available: number }[] = []

      for (const line of lines) {
        const product = db.prepare("SELECT id, name, current_stock FROM products WHERE id=?").get(line.product_id) as
          { id: string; name: string; current_stock: number } | undefined

        if (!product) throw new Error(`Product not found: ${line.product_id}`)

        if (product.current_stock < line.qty) {
          shortages.push({
            productId: product.id,
            name: product.name,
            required: line.qty,
            available: product.current_stock,
          })
        }
      }

      if (shortages.length > 0) {
        // Mark as NEEDS_RESTOCK
        db.prepare("UPDATE sales_orders SET status='NEEDS_RESTOCK', updated_at=?, updated_by=? WHERE id=?")
          .run(now, auth.id, id)

        writeAuditLog(db, {
          userId: auth.id,
          action: "SO_NEEDS_RESTOCK",
          entityType: "sales_order",
          entityId: id,
          before: { status: order.status },
          after: { status: "NEEDS_RESTOCK", shortages },
        })

        return { status: "NEEDS_RESTOCK", shortages }
      }

      // All stock available — deduct and fulfill
      for (const line of lines) {
        db.prepare("UPDATE products SET current_stock = current_stock - ? WHERE id=?")
          .run(line.qty, line.product_id)

        db.prepare(`
          INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
          VALUES ('product', ?, ?, 'Order fulfilled', 'sales_order', ?, ?, ?)
        `).run(line.product_id, -line.qty, id, auth.id, now)
      }

      db.prepare("UPDATE sales_orders SET status='READY_TO_SHIP', updated_at=?, updated_by=? WHERE id=?")
        .run(now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: "SO_FULFILLED_TO_SHIPPING",
        entityType: "sales_order",
        entityId: id,
        before: { status: order.status },
        after: { status: "READY_TO_SHIP" },
      })

      return { status: "READY_TO_SHIP", shortages: [] }
    })()

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
