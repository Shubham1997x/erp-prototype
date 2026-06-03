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
  const status = searchParams.get("status")

  const db = getDb()
  const where = status ? "WHERE ro.status = ?" : ""
  const params: unknown[] = status ? [status] : []

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM rework_orders ro ${where}`).get(...params) as { cnt: number }).cnt

  const data = db.prepare(`
    SELECT ro.*, p.name as product_name, wc.name as work_center_name
    FROM rework_orders ro
    LEFT JOIN products p ON p.id = ro.product_id
    LEFT JOIN work_centers wc ON wc.id = ro.work_center_id
    ${where}
    ORDER BY ro.created_at DESC
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
    originalProductionOrderId?: string
    qualityInspectionId?: string
    productId: string
    qty: number
    reworkReason?: string
    workCenterId?: string
    plannedStart?: string
    plannedEnd?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const {
    originalProductionOrderId,
    qualityInspectionId,
    productId,
    qty,
    reworkReason,
    workCenterId,
    plannedStart,
    plannedEnd,
  } = body

  if (!productId) return NextResponse.json({ error: "productId is required" }, { status: 400 })
  if (qty == null || qty <= 0) return NextResponse.json({ error: "qty must be a positive number" }, { status: 400 })

  const db = getDb()

  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId)
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const id = newId("rw")
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO rework_orders
      (id, original_production_order_id, quality_inspection_id, product_id, qty, status, rework_reason, work_center_id, planned_start, planned_end, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    originalProductionOrderId ?? null,
    qualityInspectionId ?? null,
    productId,
    qty,
    reworkReason ?? null,
    workCenterId ?? null,
    plannedStart ?? null,
    plannedEnd ?? null,
    auth.id,
    now,
    now
  )

  const created = db.prepare("SELECT * FROM rework_orders WHERE id = ?").get(id)
  return NextResponse.json(created, { status: 201 })
}
