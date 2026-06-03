import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

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

export async function GET() {
  const db = getDb()
  const rows = db.prepare(
    "SELECT * FROM work_centers ORDER BY name ASC"
  ).all() as Record<string, unknown>[]
  return NextResponse.json(rows.map(row))
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 })

  const db  = getDb()
  const id  = newId("wc")
  const now = new Date().toISOString()

  db.prepare(
    "INSERT INTO work_centers (id, name, capacity_per_day, unit, is_active, created_at) VALUES (?,?,?,?,1,?)"
  ).run(id, body.name, body.capacityPerDay ?? 8, body.unit ?? "hours", now)

  const created = db.prepare("SELECT * FROM work_centers WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
