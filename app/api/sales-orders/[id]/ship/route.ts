import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

/**
 * POST /api/sales-orders/[id]/ship
 *
 * Adds logistics tracking info and marks order as SHIPPED.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const db = getDb()
  const now = new Date().toISOString()

  try {
    const { trackingNumber, carrier } = await req.json()

    const result = db.transaction(() => {
      const order = db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as
        Record<string, unknown> | undefined
      if (!order) throw new Error("Sales order not found")

      if (order.status !== "READY_TO_SHIP") {
        throw new Error("Order is not ready to ship")
      }

      db.prepare("UPDATE sales_orders SET status='SHIPPED', tracking_number=?, carrier=?, updated_at=?, updated_by=? WHERE id=?")
        .run(trackingNumber || null, carrier || null, now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: "SO_SHIPPED",
        entityType: "sales_order",
        entityId: id,
        before: { status: order.status },
        after: { status: "SHIPPED", trackingNumber, carrier },
      })

      return { status: "SHIPPED", trackingNumber, carrier }
    })()

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
