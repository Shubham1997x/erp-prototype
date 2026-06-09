import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"

export const dynamic = "force-dynamic"

const CANCELLABLE_FROM = [
  "DRAFT", "SUBMITTED", "INVENTORY_CHECK", "CREDIT_HOLD",
  "APPROVED", "IN_PRODUCTION", "NEEDS_RESTOCK", "READY_TO_SHIP",
]

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { reason } = await req.json().catch(() => ({ reason: null }))
  const supabase = getSupabase()
  const now = new Date().toISOString()

  try {
    const { data: order } = await supabase.from("sales_orders").select().eq("id", id).single()
    if (!order) throw new Error("Sales order not found")
    const orderNum = order.order_number ?? id

    if (!CANCELLABLE_FROM.includes(order.status)) {
      throw new Error(
        `Cannot cancel order in status '${order.status}'. Only orders in ${CANCELLABLE_FROM.join(", ")} can be cancelled.`
      )
    }

    // Release finished goods reservations
    const { data: lines } = await supabase
      .from("sales_order_lines")
      .select("product_id, qty")
      .eq("order_id", id)

    for (const line of lines ?? []) {
      const { data: reservations } = await supabase
        .from("inventory_reservations")
        .select("reserved_qty")
        .eq("reference_id", id)
        .eq("entity_id", line.product_id)
        .eq("is_active", 1)

      const toRelease = (reservations ?? []).reduce((sum, r) => sum + r.reserved_qty, 0)
      if (toRelease > 0) {
        const { data: prod } = await supabase
          .from("products")
          .select("reserved_stock")
          .eq("id", line.product_id)
          .single()
        const newReserved = Math.max(0, (prod?.reserved_stock ?? 0) - toRelease)
        await supabase.from("products").update({ reserved_stock: newReserved }).eq("id", line.product_id)
        await supabase
          .from("inventory_reservations")
          .update({ is_active: 0, released_at: now })
          .eq("reference_id", id)
          .eq("entity_id", line.product_id)
          .eq("is_active", 1)
      }

      // If order was READY_TO_SHIP, stock was already deducted — refund it
      if (order.status === "READY_TO_SHIP") {
        const { data: prod } = await supabase
          .from("products")
          .select("current_stock")
          .eq("id", line.product_id)
          .single()
        await supabase
          .from("products")
          .update({ current_stock: (prod?.current_stock ?? 0) + line.qty })
          .eq("id", line.product_id)
        await supabase.from("stock_movements").insert({
          entity_type: "product",
          entity_id: line.product_id,
          delta: line.qty,
          reason: "Order cancelled",
          reference_type: "sales_order",
          reference_id: id,
          created_by: auth.id,
          created_at: now,
        })
      }
    }

    // Cancel linked production orders
    const { data: linkedPOs } = await supabase
      .from("production_orders")
      .select("id, status, bom_id, qty")
      .eq("sales_order_id", id)
      .not("status", "in", '("COMPLETED","CANCELLED")')

    for (const po of linkedPOs ?? []) {
      if (po.status === "MATERIAL_RESERVED" || po.status === "IN_PROGRESS") {
        const { data: comps } = await supabase
          .from("bom_components")
          .select("material_id, qty_per_unit")
          .eq("bom_id", po.bom_id)
        for (const comp of comps ?? []) {
          const needed = comp.qty_per_unit * po.qty
          const { data: rm } = await supabase
            .from("raw_materials")
            .select("reserved_stock")
            .eq("id", comp.material_id)
            .single()
          const newReserved = Math.max(0, (rm?.reserved_stock ?? 0) - needed)
          await supabase.from("raw_materials").update({ reserved_stock: newReserved }).eq("id", comp.material_id)
          await supabase
            .from("inventory_reservations")
            .update({ is_active: 0, released_at: now })
            .eq("reference_id", po.id)
            .eq("entity_id", comp.material_id)
            .eq("is_active", 1)
        }
      }
      await supabase
        .from("production_orders")
        .update({ status: "CANCELLED", updated_at: now, updated_by: auth.id })
        .eq("id", po.id)
      await writeAuditLog({
        userId: auth.id,
        action: "PROD_CANCELLED",
        entityType: "production_order",
        entityId: po.id,
        details: `Cancelled as part of SO ${id} cancellation`,
      })
    }

    // Cancel sales order
    await supabase
      .from("sales_orders")
      .update({ status: "CANCELLED", updated_at: now, updated_by: auth.id })
      .eq("id", id)
    await writeAuditLog({
      userId: auth.id,
      action: "SO_CANCELLED",
      entityType: "sales_order",
      entityId: id,
      before: { status: order.status },
      after: { status: "CANCELLED" },
      details: reason ?? "No reason provided",
    })
    await createNotification({
      role: "Production Manager",
      type: "SO_CANCELLED",
      title: `Order ${orderNum} cancelled`,
      message: `Order ${orderNum} was cancelled. ${(linkedPOs ?? []).length} production order(s) also cancelled and reservations released.`,
      entityType: "sales_order",
      entityId: id,
    })

    return NextResponse.json({ id, status: "CANCELLED", cancelledAt: now })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
