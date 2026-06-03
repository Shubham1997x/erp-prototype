import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { createNotification } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit
  const status = searchParams.get("status")
  const entityType = searchParams.get("entityType")

  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (status) { conditions.push("a.status = ?"); params.push(status) }
  if (entityType) { conditions.push("a.entity_type = ?"); params.push(entityType) }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM approvals a ${where}`).get(...params) as { cnt: number }).cnt

  const data = db.prepare(`
    SELECT a.*,
      req.name as requested_by_name,
      appr.name as approved_by_name,
      rej.name as rejected_by_name
    FROM approvals a
    LEFT JOIN users req ON req.id = a.requested_by
    LEFT JOIN users appr ON appr.id = a.approved_by
    LEFT JOIN users rej ON rej.id = a.rejected_by
    ${where}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset)

  return NextResponse.json({ data, total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  let body: { entityType: string; entityId: string; requiredRole: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { entityType, entityId, requiredRole, notes } = body

  if (!entityType) return NextResponse.json({ error: "entityType is required" }, { status: 400 })
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 })
  if (!requiredRole) return NextResponse.json({ error: "requiredRole is required" }, { status: 400 })

  const db = getDb()
  const id = newId("appr")
  const now = new Date().toISOString()

  db.transaction(() => {
    db.prepare(`
      INSERT INTO approvals
        (id, entity_type, entity_id, requested_by, required_role, status, notes, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(id, entityType, entityId, auth.id, requiredRole, notes ?? null, now)

    createNotification(db, {
      role: requiredRole,
      type: "APPROVAL_REQUESTED",
      title: `Approval Required: ${entityType}`,
      message: `A new approval is requested for ${entityType} ${entityId}.`,
      entityType,
      entityId,
    })
  })()

  const created = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id)
  return NextResponse.json(created, { status: 201 })
}
