import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    rate: r.rate,
    appliesTo: r.applies_to,
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const activeOnly = url.searchParams.get("activeOnly") !== "false"

  const where  = activeOnly ? "WHERE is_active=1" : ""
  const rows = db.prepare(
    `SELECT * FROM tax_rates ${where} ORDER BY rate ASC`
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
  if (body.rate == null) return NextResponse.json({ error: "rate is required" }, { status: 400 })

  const db  = getDb()
  const id  = newId("tax")
  const now = new Date().toISOString()

  db.prepare(
    "INSERT INTO tax_rates (id, name, rate, applies_to, is_active, created_at) VALUES (?,?,?,?,1,?)"
  ).run(id, body.name, body.rate, body.appliesTo ?? "ALL", now)

  const created = db.prepare("SELECT * FROM tax_rates WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
