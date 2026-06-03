import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    fromUnit: r.from_unit,
    toUnit: r.to_unit,
    factor: r.factor,
  }
}

export async function GET() {
  const db   = getDb()
  const rows = db.prepare(
    "SELECT * FROM unit_conversions ORDER BY from_unit ASC, to_unit ASC"
  ).all() as Record<string, unknown>[]
  return NextResponse.json(rows.map(row))
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  if (!body.fromUnit) return NextResponse.json({ error: "fromUnit is required" }, { status: 400 })
  if (!body.toUnit)   return NextResponse.json({ error: "toUnit is required" }, { status: 400 })
  if (body.factor == null || body.factor <= 0) {
    return NextResponse.json({ error: "factor must be a positive number" }, { status: 400 })
  }
  if (body.fromUnit === body.toUnit) {
    return NextResponse.json({ error: "fromUnit and toUnit must be different" }, { status: 400 })
  }

  const db = getDb()

  // Upsert: INSERT OR REPLACE
  db.prepare(
    "INSERT OR REPLACE INTO unit_conversions (from_unit, to_unit, factor) VALUES (?,?,?)"
  ).run(body.fromUnit, body.toUnit, body.factor)

  const created = db.prepare(
    "SELECT * FROM unit_conversions WHERE from_unit=? AND to_unit=?"
  ).get(body.fromUnit, body.toUnit) as Record<string, unknown>

  return NextResponse.json(row(created), { status: 201 })
}
