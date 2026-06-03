import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    fromLocationId: r.from_location_id,
    toLocationId: r.to_location_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    qty: r.qty,
    status: r.status,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page   = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit  = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"))
  const offset = (page - 1) * limit
  const status = url.searchParams.get("status")

  let where = "WHERE 1=1"
  const params: unknown[] = []
  if (status) { where += " AND status=?"; params.push(status) }

  const total = (db.prepare(`SELECT COUNT(*) as n FROM stock_transfers ${where}`).get(...params) as { n: number }).n
  const rows  = db.prepare(`SELECT * FROM stock_transfers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(row), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.entityType) return NextResponse.json({ error: "entityType is required" }, { status: 400 })
  if (!body.entityId)   return NextResponse.json({ error: "entityId is required" }, { status: 400 })
  if (!body.qty || body.qty <= 0) return NextResponse.json({ error: "qty must be positive" }, { status: 400 })

  const db  = getDb()
  const id  = newId("st")
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO stock_transfers
      (id, from_location_id, to_location_id, entity_type, entity_id, qty, status, notes, created_by, created_at)
    VALUES (?,?,?,?,?,?,'DRAFT',?,?,?)
  `).run(
    id,
    body.fromLocationId ?? null,
    body.toLocationId   ?? null,
    body.entityType,
    body.entityId,
    body.qty,
    body.notes     ?? null,
    auth.id,
    now
  )

  const created = db.prepare("SELECT * FROM stock_transfers WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
