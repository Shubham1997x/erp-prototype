import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/core"
import { enrichOrder, enrichOrdersBulk } from "@/lib/sales-order-enrich"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const supabase = getSupabase()
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"))
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "100"))
  const offset = (page - 1) * limit
  const status = url.searchParams.get("status")
  const search = url.searchParams.get("q")

  let query = supabase.from("sales_orders").select("*, lines:sales_order_lines(*, products(image_url))", { count: "exact" })

  if (status) {
    if (status.includes(",")) {
      query = query.in("status", status.split(","))
    } else {
      query = query.eq("status", status)
    }
  }

  if (search) {
    // Search by order fields; also look up matching customer IDs
    const { data: matchingCustomers } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", `%${search}%`)
    const custIds = (matchingCustomers ?? []).map((c) => c.id)

    if (custIds.length > 0) {
      query = query.or(
        `id.ilike.%${search}%,notes.ilike.%${search}%,customer_id.in.(${custIds.map((id) => `"${id}"`).join(",")})`
      )
    } else {
      query = query.or(`id.ilike.%${search}%,notes.ilike.%${search}%`)
    }
  }

  const { data: rows, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  const enriched = await enrichOrdersBulk(rows ?? [])
  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const supabase = getSupabase()
  const id = newId("so")
  const now = new Date().toISOString()

  if (!body.customerId) return NextResponse.json({ error: "customerId is required" }, { status: 400 })
  if (!body.lines?.length)
    return NextResponse.json({ error: "At least one order line is required" }, { status: 400 })

  for (const line of body.lines) {
    if (!line.productId) return NextResponse.json({ error: "Each line needs a productId" }, { status: 400 })
    if (!line.qty || line.qty <= 0)
      return NextResponse.json({ error: "Each line needs qty > 0" }, { status: 400 })
    if (!line.unitPrice || line.unitPrice <= 0)
      return NextResponse.json({ error: "Each line needs unitPrice > 0" }, { status: 400 })
  }

  // Credit limit check
  const { data: customer } = await supabase
    .from("customers")
    .select("name, credit_limit")
    .eq("id", body.customerId)
    .eq("is_active", 1)
    .single()
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const newOrderValue = body.lines.reduce(
    (sum: number, l: { qty: number; unitPrice: number }) => sum + l.qty * l.unitPrice,
    0
  )

  // Sum open exposure for this customer
  const { data: openOrders } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("customer_id", body.customerId)
    .not("status", "in", '("DELIVERED","CANCELLED","PAID")')

  const openOrderIds = (openOrders ?? []).map((o) => o.id)
  let openExposure = 0
  if (openOrderIds.length > 0) {
    const { data: lines } = await supabase
      .from("sales_order_lines")
      .select("qty, unit_price")
      .in("order_id", openOrderIds)
    openExposure = (lines ?? []).reduce((sum, l) => sum + l.qty * l.unit_price, 0)
  }

  const creditCheckPassed =
    customer.credit_limit === 0 || openExposure + newOrderValue <= customer.credit_limit
  const status = creditCheckPassed ? "DRAFT" : "CREDIT_HOLD"

  // Get order number
  const { count: soCount } = await supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true })
  const orderNumber = `#${(soCount ?? 0) + 1001}`

  await supabase.from("sales_orders").insert({
    id,
    order_number: orderNumber,
    customer_id: body.customerId,
    status,
    notes: body.notes ?? null,
    created_by: auth.id,
    created_at: now,
    updated_at: now,
    requested_delivery_date: body.requestedDeliveryDate ?? null,
    credit_check_passed: creditCheckPassed ? 1 : 0,
  })

  await supabase.from("sales_order_lines").insert(
    body.lines.map((line: { productId: string; qty: number; unitPrice: number; gstRate?: number }) => ({
      order_id: id,
      product_id: line.productId,
      qty: line.qty,
      unit_price: line.unitPrice,
      gst_rate: line.gstRate ?? null,
    }))
  )

  await writeAuditLog({
    userId: auth.id,
    action: "SO_CREATED",
    entityType: "sales_order",
    entityId: id,
    after: {
      customerId: body.customerId,
      lines: body.lines.length,
      newOrderValue,
      creditCheckPassed,
      status,
    },
  })

  const { data: created } = await supabase.from("sales_orders").select().eq("id", id).single()
  const enriched = await enrichOrder(created as Record<string, unknown>)

  if (!creditCheckPassed) {
    const over = openExposure + newOrderValue - customer.credit_limit
    return NextResponse.json(enriched, {
      status: 201,
      headers: {
        "X-Credit-Warning": `Order placed on CREDIT_HOLD. Exposure ₹${(openExposure + newOrderValue).toFixed(0)} exceeds limit ₹${customer.credit_limit.toFixed(0)} by ₹${over.toFixed(0)}`,
      },
    })
  }

  return NextResponse.json(enriched, { status: 201 })
}
