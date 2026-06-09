import { getSupabase } from "./supabase"
import { writeAuditLog, createNotification } from "./audit"

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

async function getOrderLines(orderId: string) {
  const { data } = await getSupabase()
    .from("sales_order_lines")
    .select("product_id, qty")
    .eq("order_id", orderId)
  return data ?? []
}

export async function getOrderStockShortages(orderId: string): Promise<StockShortage[]> {
  const lines = await getOrderLines(orderId)
  const shortages: StockShortage[] = []
  const supabase = getSupabase()

  for (const line of lines) {
    const { data: product } = await supabase
      .from("products")
      .select("id, name, current_stock")
      .eq("id", line.product_id)
      .single()

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

export async function fulfillSalesOrder(opts: {
  orderId: string
  userId: string
  now: string
}): Promise<FulfillOrderResult> {
  const { orderId, userId, now } = opts
  const supabase = getSupabase()

  const { data: order } = await supabase
    .from("sales_orders")
    .select()
    .eq("id", orderId)
    .single()

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

  const shortages = await getOrderStockShortages(orderId)

  if (shortages.length > 0) {
    await supabase
      .from("sales_orders")
      .update({ status: "NEEDS_RESTOCK", updated_at: now, updated_by: userId })
      .eq("id", orderId)
    await writeAuditLog({
      userId,
      action: "SO_NEEDS_RESTOCK",
      entityType: "sales_order",
      entityId: orderId,
      before: { status: priorStatus },
      after: { status: "NEEDS_RESTOCK", shortages },
    })
    return { orderId, status: "NEEDS_RESTOCK", shortages, fulfilled: false }
  }

  const lines = await getOrderLines(orderId)

  for (const line of lines) {
    const { data: product } = await supabase
      .from("products")
      .select("current_stock")
      .eq("id", line.product_id)
      .single()

    const newStock = Math.max(0, (product?.current_stock ?? 0) - line.qty)
    await supabase.from("products").update({ current_stock: newStock }).eq("id", line.product_id)

    await supabase.from("stock_movements").insert({
      entity_type: "product",
      entity_id: line.product_id,
      delta: -line.qty,
      reason: "Order fulfilled",
      reference_type: "sales_order",
      reference_id: orderId,
      created_by: userId,
      created_at: now,
    })
  }

  await supabase
    .from("sales_orders")
    .update({ status: "READY_TO_SHIP", updated_at: now, updated_by: userId })
    .eq("id", orderId)

  await writeAuditLog({
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
      title: `Order ${order.order_number ?? orderId} restocked — ready to ship`,
      message: `Inventory has restocked order ${order.order_number ?? orderId}. Stock is available; you can proceed with shipping.`,
      entityType: "sales_order",
      entityId: orderId,
    }
    if (createdBy?.startsWith("usr-")) {
      await createNotification({ ...notif, userId: createdBy })
    } else {
      await createNotification({ ...notif, role: "Sales Executive" })
    }
  }

  return { orderId, status: "READY_TO_SHIP", shortages: [], fulfilled: true }
}

export async function tryAutoFulfillOrdersForProduct(opts: {
  productId: string
  userId: string
  now: string
}): Promise<FulfillOrderResult[]> {
  const { productId, userId, now } = opts
  const supabase = getSupabase()

  // Get order IDs that include this product
  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("order_id")
    .eq("product_id", productId)

  const orderIds = [...new Set((lines ?? []).map((l) => l.order_id))]
  if (orderIds.length === 0) return []

  const { data: waiting } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("status", "NEEDS_RESTOCK")
    .in("id", orderIds)
    .order("updated_at", { ascending: true })
    .order("created_at", { ascending: true })

  const results: FulfillOrderResult[] = []
  for (const { id } of waiting ?? []) {
    results.push(await fulfillSalesOrder({ orderId: id, userId, now }))
  }
  return results
}
