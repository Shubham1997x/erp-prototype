import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    entityType: r.entity_type,
    createdBy: r.created_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    notes: r.notes,
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

  const total = (db.prepare(`SELECT COUNT(*) as n FROM cycle_counts ${where}`).get(...params) as { n: number }).n
  const rows  = db.prepare(`SELECT * FROM cycle_counts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(row), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const { entityType, entityIds, notes } = body

  if (!entityType || !["raw_material", "product"].includes(entityType)) {
    return NextResponse.json({ error: "entityType must be 'raw_material' or 'product'" }, { status: 400 })
  }

  const db  = getDb()
  const id  = newId("cc")
  const now = new Date().toISOString()
  const name = body.name ?? `Cycle Count ${now.slice(0, 10)}`
  const table = entityType === "raw_material" ? "raw_materials" : "products"

  // Resolve which entities to count
  let entitiesToCount: { id: string; current_stock: number }[]
  if (Array.isArray(entityIds) && entityIds.length > 0) {
    const placeholders = entityIds.map(() => "?").join(",")
    entitiesToCount = db.prepare(
      `SELECT id, current_stock FROM ${table} WHERE id IN (${placeholders}) AND is_active=1`
    ).all(...entityIds) as { id: string; current_stock: number }[]
  } else {
    entitiesToCount = db.prepare(
      `SELECT id, current_stock FROM ${table} WHERE is_active=1`
    ).all() as { id: string; current_stock: number }[]
  }

  if (entitiesToCount.length === 0) {
    return NextResponse.json({ error: "No active entities found to count" }, { status: 400 })
  }

  db.transaction(() => {
    db.prepare(
      "INSERT INTO cycle_counts (id, name, status, entity_type, created_by, created_at, notes) VALUES (?,?,'DRAFT',?,?,?,?)"
    ).run(id, name, entityType, auth.id, now, notes ?? null)

    for (const entity of entitiesToCount) {
      db.prepare(
        "INSERT INTO cycle_count_lines (cycle_count_id, entity_id, system_qty) VALUES (?,?,?)"
      ).run(id, entity.id, entity.current_stock)
    }
  })()

  const created = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as Record<string, unknown>
  const lineCount = (db.prepare("SELECT COUNT(*) as n FROM cycle_count_lines WHERE cycle_count_id=?").get(id) as { n: number }).n
  return NextResponse.json({ ...row(created), lineCount }, { status: 201 })
}
