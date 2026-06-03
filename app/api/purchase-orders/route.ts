import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrich(db: ReturnType<typeof getDb>, o: Record<string, unknown>) {
  const lines = db.prepare("SELECT * FROM purchase_order_lines WHERE order_id=?").all(o.id) as Record<string, unknown>[]
  return {
    id: o.id, supplierId: o.supplier_id, status: o.status, notes: o.notes,
    createdBy: o.created_by, updatedBy: o.updated_by,
    approvedBy: o.approved_by, approvedAt: o.approved_at,
    createdAt: o.created_at, updatedAt: o.updated_at, expectedDate: o.expected_date,
    lines: lines.map(l => ({
      id: l.id, materialId: l.material_id, qty: l.qty,
      unitPrice: l.unit_price, receivedQty: l.received_qty,
    })),
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page  = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit = Math.min(200, parseInt(url.searchParams.get("limit") ?? "100"))
  const offset = (page - 1) * limit

  const total = (db.prepare("SELECT COUNT(*) as n FROM purchase_orders").get() as { n: number }).n
  const rows  = db.prepare("SELECT * FROM purchase_orders ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(o => enrich(db, o)), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const data = await req.json()
  const db   = getDb()
  const now  = new Date().toISOString()
  const id   = newId("purch")  // purch- prefix — no collision with production orders (prod-)

  if (!data.supplierId) return NextResponse.json({ error: "supplierId is required" }, { status: 400 })
  if (!data.lines?.length) return NextResponse.json({ error: "At least one line is required" }, { status: 400 })

  for (const line of data.lines) {
    if (!line.materialId || !line.qty || line.qty <= 0) {
      return NextResponse.json({ error: "Each line needs materialId and qty > 0" }, { status: 400 })
    }
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO purchase_orders (id, supplier_id, status, notes, created_by, created_at, updated_at, expected_date)
      VALUES (?, ?, 'ISSUED', ?, ?, ?, ?, ?)
    `).run(id, data.supplierId, data.notes ?? null, auth.id, now, now, data.expectedDate ?? null)

    const insLine = db.prepare(`
      INSERT INTO purchase_order_lines (order_id, material_id, qty, unit_price, received_qty)
      VALUES (?, ?, ?, ?, 0)
    `)
    for (const line of data.lines) {
      insLine.run(id, line.materialId, line.qty, line.unitPrice ?? 0)
    }

    writeAuditLog(db, {
      userId: auth.id,
      action: "PO_CREATED",
      entityType: "purchase_order",
      entityId: id,
      after: { supplierId: data.supplierId, lines: data.lines.length },
    })
  })()

  return NextResponse.json({ id, status: "ISSUED" }, { status: 201 })
}
