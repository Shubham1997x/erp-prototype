import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()
  const inspection = db.prepare(`
    SELECT qi.*, u.name as inspector_name
    FROM quality_inspections qi
    LEFT JOIN users u ON u.id = qi.inspector_id
    WHERE qi.id = ?
  `).get(id)

  if (!inspection) return NextResponse.json({ error: "Quality inspection not found" }, { status: 404 })
  return NextResponse.json(inspection)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()

  const existing = db.prepare("SELECT * FROM quality_inspections WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined
  if (!existing) return NextResponse.json({ error: "Quality inspection not found" }, { status: 404 })

  let body: { notes?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { notes, status } = body

  const validStatuses = ["PENDING", "PASSED", "FAILED", "PARTIALLY_PASSED"]
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 })
  }

  const updates: string[] = []
  const values: unknown[] = []

  if (notes !== undefined) { updates.push("notes = ?"); values.push(notes) }
  if (status !== undefined) { updates.push("status = ?"); values.push(status) }

  if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 })

  values.push(id)
  db.prepare(`UPDATE quality_inspections SET ${updates.join(", ")} WHERE id = ?`).run(...values)

  const updated = db.prepare("SELECT * FROM quality_inspections WHERE id = ?").get(id)
  return NextResponse.json(updated)
}
