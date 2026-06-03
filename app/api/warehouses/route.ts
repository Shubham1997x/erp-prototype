import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

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

export async function GET() {
  const db   = getDb()
  const rows = db.prepare("SELECT * FROM warehouses ORDER BY name ASC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map(r => enrich(db, r)))
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const db  = getDb()
  const id  = newId("wh")
  const now = new Date().toISOString()

  db.prepare(
    "INSERT INTO warehouses (id, name, address, is_active, created_at) VALUES (?,?,?,1,?)"
  ).run(id, body.name, body.address ?? null, now)

  const created = db.prepare("SELECT * FROM warehouses WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(enrich(db, created), { status: 201 })
}
