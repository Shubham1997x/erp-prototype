import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()

  const suggestion = db.prepare(`
    SELECT rs.*, rm.name as material_name, rm.unit_cost
    FROM replenishment_suggestions rs
    LEFT JOIN raw_materials rm ON rm.id = rs.material_id
    WHERE rs.id = ?
  `).get(id) as
    | {
        id: string
        material_id: string
        material_name: string
        suggested_qty: number
        supplier_id: string | null
        status: string
        unit_cost: number | null
      }
    | undefined

  if (!suggestion) return NextResponse.json({ error: "Replenishment suggestion not found" }, { status: 404 })

  if (suggestion.status !== "OPEN") {
    return NextResponse.json({ error: `Suggestion is already ${suggestion.status}` }, { status: 400 })
  }

  let body: { action: "DISMISS" | "CREATE_PO" }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { action } = body

  if (!action || !["DISMISS", "CREATE_PO"].includes(action)) {
    return NextResponse.json({ error: "action must be DISMISS or CREATE_PO" }, { status: 400 })
  }

  const now = new Date().toISOString()
  let purchaseOrder: Record<string, unknown> | null = null

  db.transaction(() => {
    if (action === "CREATE_PO") {
      if (!suggestion.supplier_id) {
        throw new Error("Cannot create PO: suggestion has no associated supplier")
      }

      const poId = newId("po")
      const unitPrice = suggestion.unit_cost ?? 0

      db.prepare(`
        INSERT INTO purchase_orders (id, supplier_id, status, notes, created_by, created_at, updated_at)
        VALUES (?, ?, 'ISSUED', ?, ?, ?, ?)
      `).run(
        poId,
        suggestion.supplier_id,
        `Auto-created from replenishment suggestion ${id} for ${suggestion.material_name}`,
        auth.id,
        now,
        now
      )

      db.prepare(`
        INSERT INTO purchase_order_lines (order_id, material_id, qty, unit_price, received_qty)
        VALUES (?, ?, ?, ?, 0)
      `).run(poId, suggestion.material_id, suggestion.suggested_qty, unitPrice)

      purchaseOrder = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(poId) as Record<string, unknown>

      db.prepare(`
        UPDATE replenishment_suggestions
        SET status = 'ACTIONED', actioned_at = ?, actioned_by = ?
        WHERE id = ?
      `).run(now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: "CREATE_PO_FROM_REPLENISHMENT",
        entityType: "replenishment_suggestion",
        entityId: id,
        before: { status: "OPEN" },
        after: { status: "ACTIONED", purchaseOrderId: purchaseOrder?.id },
        details: `Created PO ${purchaseOrder?.id} for ${suggestion.suggested_qty} units of ${suggestion.material_name}`,
      })
    } else {
      // DISMISS
      db.prepare(`
        UPDATE replenishment_suggestions
        SET status = 'DISMISSED', actioned_at = ?, actioned_by = ?
        WHERE id = ?
      `).run(now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: "DISMISS_REPLENISHMENT",
        entityType: "replenishment_suggestion",
        entityId: id,
        before: { status: "OPEN" },
        after: { status: "DISMISSED" },
      })
    }
  })()

  const updated = db.prepare("SELECT * FROM replenishment_suggestions WHERE id = ?").get(id)

  return NextResponse.json({
    suggestion: updated,
    ...(purchaseOrder ? { purchaseOrder } : {}),
  })
}
