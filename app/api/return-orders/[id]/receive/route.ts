import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const ro = db.prepare("SELECT * FROM return_orders WHERE id=?").get(id) as
    { id: string; status: string } | undefined
  if (!ro) return NextResponse.json({ error: "Return order not found" }, { status: 404 })
  if (!["APPROVED", "GOODS_RECEIVED"].includes(ro.status)) {
    return NextResponse.json(
      { error: `Cannot receive goods for a return order in ${ro.status} status` },
      { status: 409 }
    )
  }

  const body = await req.json()
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 })
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    for (const line of body.lines) {
      const { lineId, receivedQty, condition } = line
      if (lineId == null || receivedQty == null) continue

      db.prepare(
        "UPDATE return_order_lines SET received_qty=?, condition=? WHERE id=? AND return_order_id=?"
      ).run(receivedQty, condition ?? "UNKNOWN", lineId, id)
    }

    db.prepare(
      "UPDATE return_orders SET status='GOODS_RECEIVED', updated_at=? WHERE id=?"
    ).run(now, id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "RETURN_GOODS_RECEIVED",
      entityType: "return_order",
      entityId: id,
      after: { status: "GOODS_RECEIVED", linesReceived: body.lines.length },
    })
  })()

  const lines = db.prepare("SELECT * FROM return_order_lines WHERE return_order_id=?").all(id) as Record<string, unknown>[]
  return NextResponse.json({
    returnOrderId: id,
    status: "GOODS_RECEIVED",
    lines: lines.map(l => ({
      id: l.id, productId: l.product_id, qty: l.qty,
      receivedQty: l.received_qty, condition: l.condition, disposition: l.disposition,
    })),
  })
}
