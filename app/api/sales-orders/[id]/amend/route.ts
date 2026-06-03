import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()

  const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as
    | {
        id: string
        customer_id: string
        status: string
        notes: string | null
        revision_number: number | null
        updated_by: string | null
      }
    | undefined

  if (!order) return NextResponse.json({ error: "Sales order not found" }, { status: 404 })

  let body: {
    changeSummary: string
    lines?: Array<{ productId: string; qty: number; unitPrice: number }>
    notes?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { changeSummary, lines, notes } = body

  if (!changeSummary || !changeSummary.trim()) {
    return NextResponse.json({ error: "changeSummary is required" }, { status: 400 })
  }

  // Lines can only be replaced for DRAFT orders
  if (lines && order.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Cannot replace lines on a ${order.status} order. Only DRAFT orders support line replacement.` },
      { status: 400 }
    )
  }

  if (lines) {
    for (const line of lines) {
      if (!line.productId) return NextResponse.json({ error: "Each line must have a productId" }, { status: 400 })
      if (line.qty == null || line.qty <= 0) {
        return NextResponse.json({ error: `qty must be positive for product ${line.productId}` }, { status: 400 })
      }
      if (line.unitPrice == null || line.unitPrice < 0) {
        return NextResponse.json({ error: `unitPrice must be non-negative for product ${line.productId}` }, { status: 400 })
      }
    }
  }

  const now = new Date().toISOString()
  const amendmentId = newId("soa")
  const newRevision = (order.revision_number ?? 1) + 1

  db.transaction(() => {
    // Capture before state
    const beforeLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>
    const beforeOrder = { ...order }

    if (lines) {
      // Replace all lines for DRAFT orders
      db.prepare("DELETE FROM sales_order_lines WHERE order_id = ?").run(id)

      for (const line of lines) {
        db.prepare(`
          INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price, fulfilled_qty)
          VALUES (?, ?, ?, ?, 0)
        `).run(id, line.productId, line.qty, line.unitPrice)
      }
    }

    // Update order metadata
    const orderUpdates: string[] = ["revision_number = ?", "updated_at = ?", "updated_by = ?"]
    const orderValues: unknown[] = [newRevision, now, auth.id]

    if (notes !== undefined) {
      orderUpdates.push("notes = ?")
      orderValues.push(notes)
    }

    orderValues.push(id)
    db.prepare(`UPDATE sales_orders SET ${orderUpdates.join(", ")} WHERE id = ?`).run(...orderValues)

    // Capture after state
    const afterLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>
    const afterOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id)

    // Record amendment
    db.prepare(`
      INSERT INTO so_amendments
        (id, sales_order_id, revision_number, changed_by, change_summary, before_state, after_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      amendmentId,
      id,
      newRevision,
      auth.id,
      changeSummary,
      JSON.stringify({ order: beforeOrder, lines: beforeLines }),
      JSON.stringify({ order: afterOrder, lines: afterLines })
    )

    writeAuditLog(db, {
      userId: auth.id,
      action: "AMEND",
      entityType: "sales_order",
      entityId: id,
      before: { revisionNumber: order.revision_number, lines: beforeLines },
      after: { revisionNumber: newRevision, lines: lines ?? beforeLines },
      details: changeSummary,
    })
  })()

  const updatedOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id)
  const updatedLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id)
  const amendment = db.prepare("SELECT * FROM so_amendments WHERE id = ?").get(amendmentId)

  return NextResponse.json({ order: updatedOrder, lines: updatedLines, amendment }, { status: 200 })
}
