import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
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
    const supabase = getSupabase()

    const { data: order } = await supabase.from("sales_orders").select().eq("id", id).single()
    if (!order) return NextResponse.json({ error: "Sales order not found" }, { status: 404 })

    if (!auth.isSales && !auth.isAdmin) {
      return NextResponse.json({ error: "Only sales or admin can edit orders" }, { status: 403 })
    }

    if (!canEditOrder(order.status as import("@/lib/types").SalesOrderStatus)) {
      return NextResponse.json({ error: `Order cannot be edited in ${order.status} status` }, { status: 400 })
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

    if (!changeSummary?.trim()) {
      return NextResponse.json({ error: "changeSummary is required" }, { status: 400 })
    }
    if (customerId && order.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Customer can only be changed while the order is in DRAFT status" },
        { status: 400 }
      )
    }
    if (customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("is_active", 1)
        .single()
      if (!cust) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }
    if (lines) {
      for (const line of lines) {
        if (!line.productId)
          return NextResponse.json({ error: "Each line must have a productId" }, { status: 400 })
        if (line.qty == null || line.qty <= 0)
          return NextResponse.json({ error: `qty must be positive for product ${line.productId}` }, { status: 400 })
        if (line.unitPrice == null || line.unitPrice < 0)
          return NextResponse.json({ error: `unitPrice must be non-negative for product ${line.productId}` }, { status: 400 })
      }
    }

    const now = new Date().toISOString()
    const amendmentId = newId("soa")
    const newRevision = (order.revision_number ?? 1) + 1

    // Capture before state
    const { data: beforeLines } = await supabase
      .from("sales_order_lines")
      .select()
      .eq("order_id", id)

    if (lines) {
      // If READY_TO_SHIP, refund stock first
      if (order.status === "READY_TO_SHIP") {
        for (const bl of beforeLines ?? []) {
          const { data: prod } = await supabase
            .from("products")
            .select("current_stock")
            .eq("id", bl.product_id)
            .single()
          await supabase
            .from("products")
            .update({ current_stock: (prod?.current_stock ?? 0) + bl.qty })
            .eq("id", bl.product_id)
          await supabase.from("stock_movements").insert({
            entity_type: "product",
            entity_id: bl.product_id,
            delta: bl.qty,
            reason: "Order amendment return",
            reference_type: "sales_order",
            reference_id: id,
            created_by: auth.id,
            created_at: now,
          })
        }
      }

      // Replace all lines
      await supabase.from("sales_order_lines").delete().eq("order_id", id)
      await supabase.from("sales_order_lines").insert(
        lines.map((line) => ({
          order_id: id,
          product_id: line.productId,
          qty: line.qty,
          unit_price: line.unitPrice,
          gst_rate: line.gstRate ?? null,
          fulfilled_qty: 0,
        }))
      )
    }

    // Build update object
    const orderUpdate: Record<string, unknown> = {
      revision_number: newRevision,
      updated_at: now,
      updated_by: auth.id,
    }
    if (lines && order.status !== "DRAFT" && order.status !== "SUBMITTED") {
      orderUpdate.status = "INVENTORY_CHECK"
    }
    if (notes !== undefined) orderUpdate.notes = notes
    if (customerId) orderUpdate.customer_id = customerId

    await supabase.from("sales_orders").update(orderUpdate).eq("id", id)

    const { data: afterLines } = await supabase
      .from("sales_order_lines")
      .select()
      .eq("order_id", id)
    const { data: afterOrder } = await supabase.from("sales_orders").select().eq("id", id).single()

    // Record amendment
    await supabase.from("so_amendments").insert({
      id: amendmentId,
      sales_order_id: id,
      revision_number: newRevision,
      changed_by: auth.id,
      change_summary: changeSummary,
      before_state: JSON.stringify({ order, lines: beforeLines }),
      after_state: JSON.stringify({ order: afterOrder, lines: afterLines }),
      created_at: now,
    })

    await writeAuditLog({
      userId: auth.id,
      action: "AMEND",
      entityType: "sales_order",
      entityId: id,
      before: { revisionNumber: order.revision_number, lines: beforeLines },
      after: { revisionNumber: newRevision, lines: lines ?? beforeLines },
      details: changeSummary,
    })

    if (order.status === "NEEDS_RESTOCK" && lines) {
      await supabase.from("notifications").insert({
        id: newId("notif"),
        role: "Inventory",
        type: "ORDER_AMENDED",
        title: "Restock Order Amended",
        message: `Sales Order ${id} was just amended by Sales. Please review any pending procurement as the quantities may have changed.`,
        entity_type: "sales_order",
        entity_id: id,
        created_at: now,
      })
    }

    // Auto-fulfill if now in INVENTORY_CHECK
    if (afterOrder?.status === "INVENTORY_CHECK") {
      try {
        await fulfillSalesOrder({ orderId: id, userId: auth.id, now })
      } catch (err) {
        console.error("Auto-fulfill after amend failed:", err)
      }
    }

    const { data: finalOrder } = await supabase.from("sales_orders").select().eq("id", id).single()
    const { data: finalLines } = await supabase.from("sales_order_lines").select().eq("order_id", id)
    const { data: amendment } = await supabase
      .from("so_amendments")
      .select()
      .eq("id", amendmentId)
      .single()

    return NextResponse.json({ order: finalOrder, lines: finalLines, amendment }, { status: 200 })
  } catch (error: any) {
    console.error("AMEND ERROR:", error)
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
  }
}
