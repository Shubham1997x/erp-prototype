import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    capacityPerDay: r.capacity_per_day,
    unit: r.unit,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const existing = db.prepare("SELECT * FROM work_centers WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!existing) return NextResponse.json({ error: "Work center not found" }, { status: 404 })

  const body = await req.json()
  const name           = body.name          ?? existing.name
  const capacityPerDay = body.capacityPerDay ?? existing.capacity_per_day
  const unit           = body.unit           ?? existing.unit

  db.prepare(
    "UPDATE work_centers SET name=?, capacity_per_day=?, unit=? WHERE id=?"
  ).run(name, capacityPerDay, unit, id)

  const updated = db.prepare("SELECT * FROM work_centers WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(updated))
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const existing = db.prepare("SELECT * FROM work_centers WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!existing) return NextResponse.json({ error: "Work center not found" }, { status: 404 })

  // Block deletion if any production orders reference this work center
  const activeRef = db.prepare(
    "SELECT id FROM production_orders WHERE work_center_id=? AND status NOT IN ('COMPLETED','CANCELLED') LIMIT 1"
  ).get(id)
  if (activeRef) {
    return NextResponse.json(
      { error: "Cannot delete: active production orders reference this work center" },
      { status: 409 }
    )
  }

  db.prepare("UPDATE work_centers SET is_active=0 WHERE id=?").run(id)
  return NextResponse.json({ success: true })
}
