import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
import { requireAuth } from "@/lib/auth"
import { enrichOrder } from "@/lib/sales-order-enrich"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req)
    const { id } = await params

    const { data: order } = await getSupabase()
      .from("sales_orders")
      .select()
      .eq("id", id)
      .single()

    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json(await enrichOrder(order as Record<string, unknown>))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}
