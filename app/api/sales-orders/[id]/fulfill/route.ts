import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { fulfillSalesOrder } from "@/lib/order-fulfill"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales-orders/[id]/fulfill
 *
 * Checks stock for all lines. If sufficient: deducts stock and sets READY_TO_SHIP.
 * If insufficient: sets NEEDS_RESTOCK and returns shortage info.
 */
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/sales-orders/[id]/fulfill">
) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const db = getDb()
  const now = new Date().toISOString()

  try {
    const result = db.transaction(() =>
      fulfillSalesOrder(db, { orderId: id, userId: auth.id, now })
    )()

    return NextResponse.json({
      status: result.status,
      shortages: result.shortages,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
