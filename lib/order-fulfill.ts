import type Database from "better-sqlite3"
import { writeAuditLog, createNotification } from "@/lib/audit"

export type StockShortage = {
  productId: string
  name: string
  required: number
  available: number
}

export type FulfillOrderResult = {
  orderId: string
  status: "READY_TO_SHIP" | "NEEDS_RESTOCK"
  shortages: StockShortage[]
  fulfilled: boolean
}

function getOrderLines(db: Database.Database, orderId: string) {
  return db.prepare("SELECT * FROM sales_order_lines WHERE order_id=?").all(orderId) as
    { product_id: string; qty: number }[]
}

export function getOrderStockShortages(db: Database.Database, orderId: string): StockShortage[] {
  const lines = getOrderLines(db, orderId)
  const shortages: StockShortage[] = []

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

  return shortages
}

export function fulfillSalesOrder(
  db: Database.Database,
  opts: { orderId: string; userId: string; now: string }
): FulfillOrderResult {
  const { orderId, userId, now } = opts

  const order = db.prepare("SELECT * FROM sales_orders WHERE id=?").get(orderId) as
    | Record<string, unknown>
    | undefined
  if (!order) throw new Error("Sales order not found")

  const priorStatus = order.status as string

  if (priorStatus !== "NEEDS_RESTOCK" && priorStatus !== "INVENTORY_CHECK") {
    return {
      orderId,
      status: priorStatus === "READY_TO_SHIP" ? "READY_TO_SHIP" : "NEEDS_RESTOCK",
      shortages: [],
      fulfilled: priorStatus === "READY_TO_SHIP",
    }
  }

  const shortages = getOrderStockShortages(db, orderId)

  if (shortages.length > 0) {
    db.prepare("UPDATE sales_orders SET status='NEEDS_RESTOCK', updated_at=?, updated_by=? WHERE id=?")
      .run(now, userId, orderId)

    writeAuditLog(db, {
      userId,
      action: "SO_NEEDS_RESTOCK",
      entityType: "sales_order",
      entityId: orderId,
      before: { status: priorStatus },
      after: { status: "NEEDS_RESTOCK", shortages },
    })

    return { orderId, status: "NEEDS_RESTOCK", shortages, fulfilled: false }
  }

  const lines = getOrderLines(db, orderId)

  for (const line of lines) {
    db.prepare("UPDATE products SET current_stock = MAX(0, current_stock - ?) WHERE id=?")
      .run(line.qty, line.product_id)

    db.prepare(`
      INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
      VALUES ('product', ?, ?, 'Order fulfilled', 'sales_order', ?, ?, ?)
    `).run(line.product_id, -line.qty, orderId, userId, now)
  }

  db.prepare("UPDATE sales_orders SET status='READY_TO_SHIP', updated_at=?, updated_by=? WHERE id=?")
    .run(now, userId, orderId)

  writeAuditLog(db, {
    userId,
    action: "SO_FULFILLED_TO_SHIPPING",
    entityType: "sales_order",
    entityId: orderId,
    before: { status: priorStatus },
    after: { status: "READY_TO_SHIP" },
  })

  if (priorStatus === "NEEDS_RESTOCK") {
    const createdBy = order.created_by as string | undefined
    const notif = {
      type: "SO_RESTOCK_COMPLETE",
      title: `Order ${(order.order_number as string | undefined) ?? orderId} restocked — ready to ship`,
      message: `Inventory has restocked order ${(order.order_number as string | undefined) ?? orderId}. Stock is available; you can proceed with shipping.`,
      entityType: "sales_order",
      entityId: orderId,
    }
    if (createdBy?.startsWith("usr-")) {
      createNotification(db, { ...notif, userId: createdBy })
    } else {
      createNotification(db, { ...notif, role: "Sales Executive" })
    }
  }

  return { orderId, status: "READY_TO_SHIP", shortages: [], fulfilled: true }
}

/** After product stock increases, try to clear waiting orders (oldest first). */
export function tryAutoFulfillOrdersForProduct(
  db: Database.Database,
  opts: { productId: string; userId: string; now: string }
): FulfillOrderResult[] {
  const { productId, userId, now } = opts

  const waiting = db.prepare(`
    SELECT DISTINCT so.id
    FROM sales_orders so
    INNER JOIN sales_order_lines sol ON sol.order_id = so.id
    WHERE so.status = 'NEEDS_RESTOCK' AND sol.product_id = ?
    ORDER BY so.updated_at ASC, so.created_at ASC
  `).all(productId) as { id: string }[]

  const results: FulfillOrderResult[] = []
  for (const { id } of waiting) {
    results.push(fulfillSalesOrder(db, { orderId: id, userId, now }))
  }
  return results
}
