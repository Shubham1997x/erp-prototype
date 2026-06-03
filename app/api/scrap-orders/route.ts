import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
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

  const db = getDb()
  const total = (db.prepare("SELECT COUNT(*) as cnt FROM scrap_orders").get() as { cnt: number }).cnt

  const data = db.prepare(`
    SELECT so.*, p.name as product_name, u.name as disposed_by_name
    FROM scrap_orders so
    LEFT JOIN products p ON p.id = so.product_id
    LEFT JOIN users u ON u.id = so.disposed_by
    ORDER BY so.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset)

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
    productionOrderId?: string
    qualityInspectionId?: string
    productId?: string
    qtyScrapped: number
    scrapReason: string
    materialCostWrittenOff?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const {
    productionOrderId,
    qualityInspectionId,
    productId,
    qtyScrapped,
    scrapReason,
    materialCostWrittenOff = 0,
  } = body

  if (qtyScrapped == null || qtyScrapped <= 0) {
    return NextResponse.json({ error: "qtyScrapped must be a positive number" }, { status: 400 })
  }
  if (!scrapReason || !scrapReason.trim()) {
    return NextResponse.json({ error: "scrapReason is required" }, { status: 400 })
  }

  const db = getDb()
  const id = newId("scrap")
  const now = new Date().toISOString()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO scrap_orders
        (id, production_order_id, quality_inspection_id, product_id, qty_scrapped, scrap_reason, material_cost_written_off, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      productionOrderId ?? null,
      qualityInspectionId ?? null,
      productId ?? null,
      qtyScrapped,
      scrapReason,
      materialCostWrittenOff,
      auth.id,
      now
    )

    writeAuditLog(db, {
      userId: auth.id,
      action: "CREATE",
      entityType: "scrap_order",
      entityId: id,
      after: {
        id,
        productionOrderId,
        qualityInspectionId,
        productId,
        qtyScrapped,
        scrapReason,
        materialCostWrittenOff,
      },
    })
  })()

  const created = db.prepare("SELECT * FROM scrap_orders WHERE id = ?").get(id)
  return NextResponse.json(created, { status: 201 })
}
