import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

function enrich(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const locations = db.prepare(
    "SELECT * FROM warehouse_locations WHERE warehouse_id=? AND is_active=1 ORDER BY name ASC"
  ).all(r.id as string) as Record<string, unknown>[]
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    locations: locations.map(l => ({
      id: l.id, name: l.name, type: l.type, isActive: Boolean(l.is_active),
    })),
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const wh = db.prepare("SELECT * FROM warehouses WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!wh) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 })
  return NextResponse.json(enrich(db, wh))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()
  const existing = db.prepare("SELECT * FROM warehouses WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!existing) return NextResponse.json({ error: "Warehouse not found" }, { status: 404 })

  const body    = await req.json()
  const name    = body.name    ?? existing.name
  const address = body.address ?? existing.address

  db.prepare("UPDATE warehouses SET name=?, address=? WHERE id=?").run(name, address, id)

  const updated = db.prepare("SELECT * FROM warehouses WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, updated))
}
