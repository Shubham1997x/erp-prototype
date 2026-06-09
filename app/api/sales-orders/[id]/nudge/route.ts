import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
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
  const supabase = getSupabase()

  const { data: order } = await supabase
    .from("sales_orders")
    .select("id, status, customer_id, order_number")
    .eq("id", id)
    .single()

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })
  if (order.status !== "NEEDS_RESTOCK") {
    return NextResponse.json(
      { error: "Nudge is only available for orders that need restock" },
      { status: 400 }
    )
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("name")
    .eq("id", order.customer_id)
    .single()

  const customerName = customer?.name ?? "Unknown customer"
  const orderNum = order.order_number ?? id

  await createNotification({
    role: "Inventory Manager",
    type: "SO_NUDGE_RESTOCK",
    title: `Order ${orderNum} — restock reminder`,
    message: `${auth.name} nudged inventory to restock order ${orderNum} (${customerName}).`,
    entityType: "sales_order",
    entityId: id,
  })

  await writeAuditLog({
    userId: auth.id,
    action: "SO_NUDGE_INVENTORY",
    entityType: "sales_order",
    entityId: id,
    after: { nudgedBy: auth.name, customerName },
  })

  return NextResponse.json({ ok: true })
}
