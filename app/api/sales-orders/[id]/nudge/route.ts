import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { createNotification, writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  if (!auth.isSales && !auth.isAdmin) {
    return NextResponse.json({ error: "Only sales can nudge inventory" }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const order = db.prepare("SELECT id, status, customer_id, order_number FROM sales_orders WHERE id = ?").get(id) as
    | { id: string; status: string; customer_id: string; order_number?: string }
    | undefined

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
  if (order.status !== "NEEDS_RESTOCK") {
    return NextResponse.json({ error: "Nudge is only available for orders that need restock" }, { status: 400 })
  }

  const customer = db.prepare("SELECT name FROM customers WHERE id = ?").get(order.customer_id) as
    | { name: string }
    | undefined

  const customerName = customer?.name ?? "Unknown customer"
  const orderNum = order.order_number ?? id

  createNotification(db, {
    role: "Inventory Manager",
    type: "SO_NUDGE_RESTOCK",
    title: `Order ${orderNum} — restock reminder`,
    message: `${auth.name} nudged inventory to restock order ${orderNum} (${customerName}).`,
    entityType: "sales_order",
    entityId: id,
  })

  writeAuditLog(db, {
    userId: auth.id,
    action: "SO_NUDGE_INVENTORY",
    entityType: "sales_order",
    entityId: id,
    after: { nudgedBy: auth.name, customerName },
  })

  return NextResponse.json({ ok: true })
}
