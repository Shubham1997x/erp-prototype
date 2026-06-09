import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/core"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const supabase = getSupabase()

  const { data: originalOrder } = await supabase.from("sales_orders").select().eq("id", id).single()
  if (!originalOrder) return NextResponse.json({ error: "Sales order not found" }, { status: 404 })

  let body: { lines: Array<{ productId: string; fulfilledQty: number; backorderQty: number }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { lines } = body
  if (!lines?.length) {
    return NextResponse.json({ error: "lines array is required and must not be empty" }, { status: 400 })
  }
  for (const line of lines) {
    if (!line.productId) return NextResponse.json({ error: "Each line must have a productId" }, { status: 400 })
    if (line.backorderQty == null || line.backorderQty <= 0)
      return NextResponse.json({ error: `backorderQty must be positive for product ${line.productId}` }, { status: 400 })
    if (line.fulfilledQty == null || line.fulfilledQty < 0)
      return NextResponse.json({ error: `fulfilledQty must be non-negative for product ${line.productId}` }, { status: 400 })
  }

  const now = new Date().toISOString()
  const newOrderId = newId("so")
  const amendmentId = newId("soa")

  const { data: beforeLines } = await supabase
    .from("sales_order_lines")
    .select()
    .eq("order_id", id)

  // Update fulfilled_qty on original SO lines
  for (const line of lines) {
    const existing = (beforeLines ?? []).find((bl: any) => bl.product_id === line.productId)
    if (!existing) throw new Error(`Line for product ${line.productId} not found in sales order ${id}`)

    const newFulfilled = (existing.fulfilled_qty ?? 0) + line.fulfilledQty
    if (newFulfilled > existing.qty) {
      return NextResponse.json(
        { error: `fulfilledQty (${newFulfilled}) exceeds ordered qty (${existing.qty}) for product ${line.productId}` },
        { status: 400 }
      )
    }
    await supabase
      .from("sales_order_lines")
      .update({ fulfilled_qty: newFulfilled })
      .eq("id", existing.id)
  }

  await supabase
    .from("sales_orders")
    .update({ updated_at: now, updated_by: auth.id })
    .eq("id", id)

  // Create backorder SO
  await supabase.from("sales_orders").insert({
    id: newOrderId,
    customer_id: originalOrder.customer_id,
    status: "DRAFT",
    notes: `Backorder from ${id}`,
    created_by: auth.id,
    created_at: now,
    updated_at: now,
    parent_order_id: id,
    revision_number: 2,
  })

  for (const line of lines) {
    const original = (beforeLines ?? []).find((bl: any) => bl.product_id === line.productId)
    await supabase.from("sales_order_lines").insert({
      order_id: newOrderId,
      product_id: line.productId,
      qty: line.backorderQty,
      unit_price: original?.unit_price ?? 0,
      fulfilled_qty: 0,
    })
  }

  const { data: backorderOrder } = await supabase
    .from("sales_orders")
    .select()
    .eq("id", newOrderId)
    .single()

  const { data: afterLines } = await supabase
    .from("sales_order_lines")
    .select()
    .eq("order_id", id)

  await supabase.from("so_amendments").insert({
    id: amendmentId,
    sales_order_id: id,
    revision_number: (originalOrder.revision_number ?? 1) + 1,
    changed_by: auth.id,
    change_summary: `Backorder created: ${lines.length} line(s) partially fulfilled, backorder SO ${newOrderId} created`,
    before_state: JSON.stringify({ lines: beforeLines }),
    after_state: JSON.stringify({ lines: afterLines, backorderOrderId: newOrderId }),
    created_at: now,
  })

  await writeAuditLog({
    userId: auth.id,
    action: "CREATE_BACKORDER",
    entityType: "sales_order",
    entityId: id,
    before: { lines: beforeLines },
    after: { backorderOrderId: newOrderId },
    details: `Backorder SO ${newOrderId} created from ${id}`,
  })

  return NextResponse.json({ backorderOrder, amendmentId }, { status: 201 })
}
