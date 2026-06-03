import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
}

function enrich(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const entityType = r.entity_type as string
  const table      = entityType === "raw_material" ? "raw_materials" : "products"
  const nameCol    = entityType === "raw_material" ? "name" : "name"
  const skuJoin    = entityType === "product"
    ? ", e.sku"
    : ""
  const skuSelect  = entityType === "product" ? ", sku: l.sku" : ""

  const lines = db.prepare(`
    SELECT ccl.*, e.${nameCol} as entity_name ${entityType === "product" ? ", e.sku" : ""}
    FROM cycle_count_lines ccl
    LEFT JOIN ${table} e ON e.id = ccl.entity_id
    WHERE ccl.cycle_count_id = ?
    ORDER BY e.${nameCol} ASC
  `).all(r.id as string) as Record<string, unknown>[]

  return {
    id: r.id,
    name: r.name,
    status: r.status,
    entityType: r.entity_type,
    createdBy: r.created_by,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    notes: r.notes,
    lines: lines.map(l => ({
      id: l.id,
      entityId: l.entity_id,
      entityName: l.entity_name,
      ...(entityType === "product" ? { sku: l.sku } : {}),
      systemQty: l.system_qty,
      countedQty: l.counted_qty,
      variance: l.variance,
      countedBy: l.counted_by,
      countedAt: l.counted_at,
    })),
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const cc = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!cc) return NextResponse.json({ error: "Cycle count not found" }, { status: 404 })
  return NextResponse.json(enrich(db, cc))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const cc = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as
    { id: string; status: string } | undefined
  if (!cc) return NextResponse.json({ error: "Cycle count not found" }, { status: 404 })

  const body   = await req.json()
  const status = body.status

  if (status) {
    const allowed = VALID_TRANSITIONS[cc.status] ?? []
    if (!allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from ${cc.status} to ${status}` },
        { status: 409 }
      )
    }
    db.prepare("UPDATE cycle_counts SET status=? WHERE id=?").run(status, id)
  }

  const updated = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, updated))
}
