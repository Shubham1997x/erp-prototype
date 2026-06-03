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

  const transfer = db.prepare("SELECT * FROM stock_transfers WHERE id=?").get(id) as
    { id: string; entity_type: string; entity_id: string; qty: number; status: string; from_location_id: string | null; to_location_id: string | null } | undefined
  if (!transfer) return NextResponse.json({ error: "Stock transfer not found" }, { status: 404 })
  if (transfer.status === "COMPLETED") return NextResponse.json({ error: "Transfer is already completed" }, { status: 409 })
  if (transfer.status === "CANCELLED") return NextResponse.json({ error: "Cannot complete a cancelled transfer" }, { status: 409 })

  // Validate entity stock
  const table = transfer.entity_type === "raw_material" ? "raw_materials" : "products"
  const entity = db.prepare(`SELECT id, current_stock, reserved_stock FROM ${table} WHERE id=?`).get(transfer.entity_id) as
    { id: string; current_stock: number; reserved_stock: number } | undefined
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 })

  if (entity.current_stock < transfer.qty) {
    return NextResponse.json(
      { error: `Insufficient stock: available ${entity.current_stock}, required ${transfer.qty}` },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    // Deduct from source
    db.prepare(`UPDATE ${table} SET current_stock = current_stock - ? WHERE id=?`).run(transfer.qty, transfer.entity_id)

    // Stock movement: out from source
    db.prepare(`
      INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      transfer.entity_type, transfer.entity_id,
      -transfer.qty, "Stock transfer — out",
      "stock_transfer", transfer.id,
      auth.id, now
    )

    // Stock movement: in to destination (the stock has "moved" — total stays same logically,
    // but here we add it back since both locations share the same entity stock pool)
    db.prepare(`UPDATE ${table} SET current_stock = current_stock + ? WHERE id=?`).run(transfer.qty, transfer.entity_id)

    db.prepare(`
      INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      transfer.entity_type, transfer.entity_id,
      transfer.qty, "Stock transfer — in",
      "stock_transfer", transfer.id,
      auth.id, now
    )

    // Mark transfer completed
    db.prepare(
      "UPDATE stock_transfers SET status='COMPLETED', completed_at=? WHERE id=?"
    ).run(now, transfer.id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "STOCK_TRANSFER_COMPLETED",
      entityType: "stock_transfer",
      entityId: transfer.id,
      after: { qty: transfer.qty, entityType: transfer.entity_type, entityId: transfer.entity_id },
    })
  })()

  const updated = db.prepare("SELECT * FROM stock_transfers WHERE id=?").get(transfer.id) as Record<string, unknown>
  return NextResponse.json({
    id: updated.id,
    fromLocationId: updated.from_location_id,
    toLocationId: updated.to_location_id,
    entityType: updated.entity_type,
    entityId: updated.entity_id,
    qty: updated.qty,
    status: updated.status,
    completedAt: updated.completed_at,
  })
}
