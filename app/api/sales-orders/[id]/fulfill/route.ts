import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { fulfillSalesOrder } from "@/lib/order-fulfill"

export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const now = new Date().toISOString()

  try {
    const result = await fulfillSalesOrder({ orderId: id, userId: auth.id, now })
    return NextResponse.json({ status: result.status, shortages: result.shortages })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
