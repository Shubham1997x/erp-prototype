import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const cc = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as
    { id: string; status: string } | undefined
  if (!cc) return NextResponse.json({ error: "Cycle count not found" }, { status: 404 })
  if (!["DRAFT", "IN_PROGRESS"].includes(cc.status)) {
    return NextResponse.json(
      { error: `Cannot record counts on a cycle count in ${cc.status} status` },
      { status: 409 }
    )
  }

  const body = await req.json()
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "lines array is required" }, { status: 400 })
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    for (const line of body.lines) {
      const { entityId, countedQty, countedBy } = line
      if (entityId == null || countedQty == null) continue

      const ccLine = db.prepare(
        "SELECT id, system_qty FROM cycle_count_lines WHERE cycle_count_id=? AND entity_id=?"
      ).get(id, entityId) as { id: number; system_qty: number } | undefined
      if (!ccLine) continue

      const variance = (countedQty as number) - ccLine.system_qty
      db.prepare(`
        UPDATE cycle_count_lines
        SET counted_qty=?, variance=?, counted_by=?, counted_at=?
        WHERE id=?
      `).run(countedQty, variance, countedBy ?? auth.id, now, ccLine.id)
    }

    // Auto-advance to IN_PROGRESS if still DRAFT
    if (cc.status === "DRAFT") {
      db.prepare("UPDATE cycle_counts SET status='IN_PROGRESS' WHERE id=?").run(id)
    }
  })()

  const lines = db.prepare(
    "SELECT * FROM cycle_count_lines WHERE cycle_count_id=? ORDER BY id ASC"
  ).all(id) as Record<string, unknown>[]

  return NextResponse.json({
    cycleCountId: id,
    linesUpdated: body.lines.length,
    lines: lines.map(l => ({
      id: l.id,
      entityId: l.entity_id,
      systemQty: l.system_qty,
      countedQty: l.counted_qty,
      variance: l.variance,
      countedBy: l.counted_by,
      countedAt: l.counted_at,
    })),
  })
}
