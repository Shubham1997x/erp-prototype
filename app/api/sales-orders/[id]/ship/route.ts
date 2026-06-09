import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = getSupabase()
  const now = new Date().toISOString()

  try {
    const { trackingNumber, carrier } = await req.json()

    const { data: order } = await supabase.from("sales_orders").select().eq("id", id).single()
    if (!order) throw new Error("Sales order not found")
    if (order.status !== "READY_TO_SHIP") throw new Error("Order is not ready to ship")

    await supabase
      .from("sales_orders")
      .update({
        status: "SHIPPED",
        tracking_number: trackingNumber || null,
        carrier: carrier || null,
        updated_at: now,
        updated_by: auth.id,
      })
      .eq("id", id)

    await writeAuditLog({
      userId: auth.id,
      action: "SO_SHIPPED",
      entityType: "sales_order",
      entityId: id,
      before: { status: order.status },
      after: { status: "SHIPPED", trackingNumber, carrier },
    })

    return NextResponse.json({ status: "SHIPPED", trackingNumber, carrier })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
