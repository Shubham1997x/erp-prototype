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

  const originalOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as
    | {
        id: string
        customer_id: string
        status: string
        notes: string | null
        revision_number: number | null
        credit_check_passed: number
        approval_status: string | null
      }
    | undefined

  if (!originalOrder) return NextResponse.json({ error: "Sales order not found" }, { status: 404 })

  let body: {
    lines: Array<{ productId: string; fulfilledQty: number; backorderQty: number }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { lines } = body

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "lines array is required and must not be empty" }, { status: 400 })
  }

  for (const line of lines) {
    if (!line.productId) return NextResponse.json({ error: "Each line must have a productId" }, { status: 400 })
    if (line.backorderQty == null || line.backorderQty <= 0) {
      return NextResponse.json({ error: `backorderQty must be positive for product ${line.productId}` }, { status: 400 })
    }
    if (line.fulfilledQty == null || line.fulfilledQty < 0) {
      return NextResponse.json({ error: `fulfilledQty must be non-negative for product ${line.productId}` }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const newOrderId = newId("so")
  const amendmentId = newId("soa")

  let backorderOrder: Record<string, unknown> | null = null

  db.transaction(() => {
    // Capture before state for amendment record
    const beforeLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>

    // Update fulfilled_qty on original SO lines
    for (const line of lines) {
      const existingLine = db.prepare(
        "SELECT * FROM sales_order_lines WHERE order_id = ? AND product_id = ?"
      ).get(id, line.productId) as { id: number; qty: number; fulfilled_qty: number; unit_price: number } | undefined

      if (!existingLine) {
        throw new Error(`Line for product ${line.productId} not found in sales order ${id}`)
      }

      const newFulfilled = (existingLine.fulfilled_qty ?? 0) + line.fulfilledQty
      if (newFulfilled > existingLine.qty) {
        throw new Error(
          `fulfilledQty (${newFulfilled}) exceeds ordered qty (${existingLine.qty}) for product ${line.productId}`
        )
      }

      db.prepare("UPDATE sales_order_lines SET fulfilled_qty = ? WHERE id = ?").run(newFulfilled, existingLine.id)
    }

    // Update original SO updated_at
    db.prepare("UPDATE sales_orders SET updated_at = ?, updated_by = ? WHERE id = ?").run(now, auth.id, id)

    // Create backorder SO in DRAFT status
    db.prepare(`
      INSERT INTO sales_orders
        (id, customer_id, status, notes, created_by, created_at, updated_at, parent_order_id, revision_number)
      VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, 2)
    `).run(
      newOrderId,
      originalOrder.customer_id,
      `Backorder from ${id}`,
      auth.id,
      now,
      now,
      id
    )

    // Create backorder SO lines with only backorder quantities
    for (const line of lines) {
      const originalLine = db.prepare(
        "SELECT unit_price FROM sales_order_lines WHERE order_id = ? AND product_id = ?"
      ).get(id, line.productId) as { unit_price: number } | undefined

      db.prepare(`
        INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price, fulfilled_qty)
        VALUES (?, ?, ?, ?, 0)
      `).run(newOrderId, line.productId, line.backorderQty, originalLine?.unit_price ?? 0)
    }

    backorderOrder = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(newOrderId) as Record<string, unknown>

    // Record SO amendment
    const afterLines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as Array<Record<string, unknown>>

    db.prepare(`
      INSERT INTO so_amendments
        (id, sales_order_id, revision_number, changed_by, change_summary, before_state, after_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      amendmentId,
      id,
      (originalOrder.revision_number ?? 1) + 1,
      auth.id,
      `Backorder created: ${lines.length} line(s) partially fulfilled, backorder SO ${newOrderId} created`,
      JSON.stringify({ lines: beforeLines }),
      JSON.stringify({ lines: afterLines, backorderOrderId: newOrderId })
    )

    writeAuditLog(db, {
      userId: auth.id,
      action: "CREATE_BACKORDER",
      entityType: "sales_order",
      entityId: id,
      before: { lines: beforeLines },
      after: { backorderOrderId: newOrderId },
      details: `Backorder SO ${newOrderId} created from ${id}`,
    })
  })()

  return NextResponse.json({ backorderOrder, amendmentId }, { status: 201 })
}
