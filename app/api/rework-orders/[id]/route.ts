import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING:     ["IN_PROGRESS", "SCRAPPED"],
  IN_PROGRESS: ["COMPLETED", "SCRAPPED"],
  COMPLETED:   [],
  SCRAPPED:    [],
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()

  const existing = db.prepare("SELECT * FROM rework_orders WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined
  if (!existing) return NextResponse.json({ error: "Rework order not found" }, { status: 404 })

  let body: { status?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { status: newStatus } = body

  if (!newStatus) return NextResponse.json({ error: "status is required" }, { status: 400 })

  const currentStatus = existing.status as string
  const allowed = VALID_TRANSITIONS[currentStatus] ?? []
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(", ") || "none"}` },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const completedAt = newStatus === "COMPLETED" ? now : (existing.completed_at as string | null)

  db.transaction(() => {
    db.prepare(`
      UPDATE rework_orders
      SET status = ?, completed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, completedAt ?? null, now, id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "STATUS_CHANGE",
      entityType: "rework_order",
      entityId: id,
      before: { status: currentStatus },
      after: { status: newStatus },
      details: `Status changed from ${currentStatus} to ${newStatus}`,
    })
  })()

  const updated = db.prepare("SELECT * FROM rework_orders WHERE id = ?").get(id)
  return NextResponse.json(updated)
}
