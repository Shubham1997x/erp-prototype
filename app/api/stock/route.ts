import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, checkReplenishment } from "@/lib/audit"
import { tryAutoFulfillOrdersForProduct } from "@/lib/order-fulfill"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { entityType, entityId, delta, reason } = await req.json()
  const supabase = getSupabase()
  const now = new Date().toISOString()

  if (!reason?.trim()) {
    return NextResponse.json({ error: "reason is required for stock adjustments" }, { status: 400 })
  }
  if (delta === 0) {
    return NextResponse.json({ error: "delta cannot be zero" }, { status: 400 })
  }

  try {
    let autoFulfilledOrders: string[] = []

    if (entityType === "raw_material") {
      const { data: rm } = await supabase
        .from("raw_materials")
        .select("current_stock, name")
        .eq("id", entityId)
        .single()
      if (!rm) throw new Error("Raw material not found")
      if (delta < 0 && rm.current_stock + delta < 0) {
        throw new Error(
          `Cannot adjust: only ${rm.current_stock} in stock, cannot remove ${Math.abs(delta)}`
        )
      }
      const before = { current_stock: rm.current_stock }
      await supabase
        .from("raw_materials")
        .update({ current_stock: rm.current_stock + delta })
        .eq("id", entityId)
      await writeAuditLog({
        userId: auth.id,
        action: "STOCK_ADJUSTED",
        entityType: "raw_material",
        entityId,
        before,
        after: { current_stock: rm.current_stock + delta },
        details: reason,
      })
      if (delta < 0) await checkReplenishment()
    } else {
      const { data: prod } = await supabase
        .from("products")
        .select("current_stock, name")
        .eq("id", entityId)
        .single()
      if (!prod) throw new Error("Product not found")
      if (delta < 0 && prod.current_stock + delta < 0) {
        throw new Error(
          `Cannot adjust: only ${prod.current_stock} in stock, cannot remove ${Math.abs(delta)}`
        )
      }
      const before = { current_stock: prod.current_stock }
      await supabase
        .from("products")
        .update({ current_stock: prod.current_stock + delta })
        .eq("id", entityId)
      await writeAuditLog({
        userId: auth.id,
        action: "STOCK_ADJUSTED",
        entityType: "product",
        entityId,
        before,
        after: { current_stock: prod.current_stock + delta },
        details: reason,
      })

      if (delta > 0) {
        const results = await tryAutoFulfillOrdersForProduct({
          productId: entityId,
          userId: auth.id,
          now,
        })
        autoFulfilledOrders = results.filter((r) => r.fulfilled).map((r) => r.orderId)
      }
    }

    await supabase.from("stock_movements").insert({
      entity_type: entityType,
      entity_id: entityId,
      delta,
      reason,
      reference_type: "manual_adjustment",
      reference_id: entityId,
      created_by: auth.id,
      created_at: now,
    })

    return NextResponse.json({ ok: true, autoFulfilledOrders })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
