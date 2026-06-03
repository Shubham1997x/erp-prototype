import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit
  const productionOrderId = searchParams.get("productionOrderId")

  const db = getDb()
  const where = productionOrderId ? "WHERE qi.production_order_id = ?" : ""
  const params: unknown[] = productionOrderId ? [productionOrderId] : []

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM quality_inspections qi ${where}`).get(...params) as { cnt: number }).cnt

  const data = db.prepare(`
    SELECT qi.*, u.name as inspector_name
    FROM quality_inspections qi
    LEFT JOIN users u ON u.id = qi.inspector_id
    ${where}
    ORDER BY qi.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return NextResponse.json({ data, total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  let body: {
    productionOrderId: string
    producedQty: number
    passedQty: number
    rejectedQty?: number
    defectCodes?: string
    notes?: string
    inspectorId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { productionOrderId, producedQty, passedQty, rejectedQty = 0, defectCodes, notes, inspectorId } = body

  if (!productionOrderId) return NextResponse.json({ error: "productionOrderId is required" }, { status: 400 })
  if (producedQty == null) return NextResponse.json({ error: "producedQty is required" }, { status: 400 })
  if (passedQty == null) return NextResponse.json({ error: "passedQty is required" }, { status: 400 })

  if (passedQty + rejectedQty > producedQty) {
    return NextResponse.json(
      { error: `passedQty (${passedQty}) + rejectedQty (${rejectedQty}) cannot exceed producedQty (${producedQty})` },
      { status: 400 }
    )
  }

  const db = getDb()

  const po = db.prepare("SELECT id, status FROM production_orders WHERE id = ?").get(productionOrderId) as
    | { id: string; status: string }
    | undefined
  if (!po) return NextResponse.json({ error: "Production order not found" }, { status: 404 })

  let status: string
  if (rejectedQty === 0) status = "PASSED"
  else if (passedQty === 0) status = "FAILED"
  else status = "PARTIALLY_PASSED"

  const id = newId("qi")
  const now = new Date().toISOString()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO quality_inspections
        (id, production_order_id, inspector_id, inspected_at, produced_qty, passed_qty, rejected_qty, defect_codes, notes, status, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      productionOrderId,
      inspectorId ?? auth.id,
      now,
      producedQty,
      passedQty,
      rejectedQty,
      defectCodes ?? null,
      notes ?? null,
      status,
      auth.id,
      now
    )

    if (po.status === "IN_PROGRESS") {
      db.prepare("UPDATE production_orders SET status = 'QUALITY_CHECK', updated_at = ? WHERE id = ?").run(now, productionOrderId)
    }
  })()

  const created = db.prepare("SELECT * FROM quality_inspections WHERE id = ?").get(id)
  return NextResponse.json(created, { status: 201 })
}
