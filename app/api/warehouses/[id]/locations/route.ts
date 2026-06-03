import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    warehouseId: r.warehouse_id,
    name: r.name,
    type: r.type,
    isActive: Boolean(r.is_active),
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const wh = db.prepare("SELECT id FROM warehouses WHERE id=?").get(id)
  if (!wh) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 })

  const rows = db.prepare(
    "SELECT * FROM warehouse_locations WHERE warehouse_id=? ORDER BY name ASC"
  ).all(id) as Record<string, unknown>[]
  return NextResponse.json(rows.map(row))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const wh = db.prepare("SELECT id FROM warehouses WHERE id=?").get(id)
  if (!wh) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 })

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const locId = newId("wl")
  db.prepare(
    "INSERT INTO warehouse_locations (id, warehouse_id, name, type, is_active) VALUES (?,?,?,?,1)"
  ).run(locId, id, body.name, body.type ?? "STORAGE")

  const created = db.prepare("SELECT * FROM warehouse_locations WHERE id=?").get(locId) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
