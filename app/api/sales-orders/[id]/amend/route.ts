import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/core"
import { canEditOrder } from "@/lib/order-edit"
import { fulfillSalesOrder } from "@/lib/order-fulfill"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    let auth: Awaited<ReturnType<typeof requireNotViewer>>
    try {
      auth = await requireNotViewer(req)
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 401 })
    }

  const { id } = await params
  const db = getDb()

  const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as
    | {
        id: string
        customer_id: string
        status: string
        notes: string | null
        revision_number: number | null
        updated_by: string | null
      }
    | undefined

  if (!order) return NextResponse.json({ error: "Sales order not found" }, { status: 404 })

  if (!auth.isSales && !auth.isAdmin) {
    return NextResponse.json({ error: "Only sales or admin can edit orders" }, { status: 403 })
  }

  if (!canEditOrder(order.status as import("@/lib/types").SalesOrderStatus)) {
    return NextResponse.json(
      { error: `Order cannot be edited in ${order.status} status` },
      { status: 400 }
    )
  }

  let body: {
    changeSummary: string
    lines?: Array<{ productId: string; qty: number; unitPrice: number; gstRate?: number }>
    notes?: string
    customerId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { changeSummary, lines, notes, customerId } = body

  if (!changeSummary || !changeSummary.trim()) {
    return NextResponse.json({ error: "changeSummary is required" }, { status: 400 })
  }

  if (customerId && order.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Customer can only be changed while the order is in DRAFT status" },
      { status: 400 }
    )
  }

  if (customerId) {
    const customer = db.prepare("SELECT id FROM customers WHERE id=? AND is_active=1").get(customerId)
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }

  if (lines) {
    for (const line of lines) {
      if (!line.productId) return NextResponse.json({ error: "Each line must have a productId" }, { status: 400 })
      if (line.qty == null || line.qty <= 0) {
        return NextResponse.json({ error: `qty must be positive for product ${line.productId}` }, { status: 400 })
      }
      if (line.unitPrice == null || line.unitPrice < 0) {
        return NextResponse.json({ error: `unitPrice must be non-negative for product ${line.productId}` }, { status: 400 })
      }
    }
  }

  const now = new Date().toISOString()
  const amendmentId = newId("soa")
  const newRevision = (order.revision_number ?? 1) + 1

  db.transaction(() => {
    // Capture before state
    const beforeLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>
    const beforeOrder = { ...order }

    if (lines) {
      if (order.status === "READY_TO_SHIP") {
        for (const bl of beforeLines) {
          const product_id = bl.product_id as string
          const qty = bl.qty as number
          db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?").run(qty, product_id)
          db.prepare(`
            INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
            VALUES ('product', ?, ?, 'Order amendment return', 'sales_order', ?, ?, ?)
          `).run(product_id, qty, id, auth.id, now)
        }
      }

      // Replace all lines
      db.prepare("DELETE FROM sales_order_lines WHERE order_id = ?").run(id)

      for (const line of lines) {
        db.prepare(`
          INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price, gst_rate, fulfilled_qty)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(id, line.productId, line.qty, line.unitPrice, line.gstRate ?? null)
      }
    }

    // Update order metadata
    const orderUpdates: string[] = ["revision_number = ?", "updated_at = ?", "updated_by = ?"]
    const orderValues: unknown[] = [newRevision, now, auth.id]

    if (lines && order.status !== "DRAFT" && order.status !== "SUBMITTED") {
      orderUpdates.push("status = ?")
      orderValues.push("INVENTORY_CHECK")
    }

    if (notes !== undefined) {
      orderUpdates.push("notes = ?")
      orderValues.push(notes)
    }

    if (customerId) {
      orderUpdates.push("customer_id = ?")
      orderValues.push(customerId)
    }

    orderValues.push(id)
    db.prepare(`UPDATE sales_orders SET ${orderUpdates.join(", ")} WHERE id = ?`).run(...orderValues)

    // Capture after state
    const afterLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>
    const afterOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id)

    // Record amendment
    db.prepare(`
      INSERT INTO so_amendments
        (id, sales_order_id, revision_number, changed_by, change_summary, before_state, after_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      amendmentId,
      id,
      newRevision,
      auth.id,
      changeSummary,
      JSON.stringify({ order: beforeOrder, lines: beforeLines }),
      JSON.stringify({ order: afterOrder, lines: afterLines }),
      now
    )

    writeAuditLog(db, {
      userId: auth.id,
      action: "AMEND",
      entityType: "sales_order",
      entityId: id,
      before: { revisionNumber: order.revision_number, lines: beforeLines },
      after: { revisionNumber: newRevision, lines: lines ?? beforeLines },
      details: changeSummary,
    })

    // Notify Inventory if order was in NEEDS_RESTOCK
    if (beforeOrder.status === "NEEDS_RESTOCK" && lines) {
      db.prepare(`
        INSERT INTO notifications (id, role, type, title, message, entity_type, entity_id, created_at)
        VALUES (?, 'Inventory', 'ORDER_AMENDED', 'Restock Order Amended', ?, 'sales_order', ?, ?)
      `).run(
        newId("notif"),
        `Sales Order ${id} was just amended by Sales. Please review any pending procurement as the quantities may have changed.`,
        id,
        now
      )
    }
  })()

  // Attempt auto-fulfill if we pushed it to INVENTORY_CHECK
  try {
    const freshOrder = db.prepare("SELECT status FROM sales_orders WHERE id = ?").get(id) as { status: string }
    if (freshOrder.status === "INVENTORY_CHECK") {
      db.transaction(() => fulfillSalesOrder(db, { orderId: id, userId: auth.id, now }))()
    }
  } catch (err) {
    console.error("Auto-fulfill after amend failed:", err)
  }

  const updatedOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id)
  const updatedLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id)
  const amendment = db.prepare("SELECT * FROM so_amendments WHERE id = ?").get(amendmentId)

    return NextResponse.json({ order: updatedOrder, lines: updatedLines, amendment }, { status: 200 })
  } catch (error: any) {
    console.error("AMEND ERROR:", error);
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}
