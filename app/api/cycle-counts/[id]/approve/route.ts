import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await params
  const db = getDb()

  const cc = db.prepare("SELECT * FROM cycle_counts WHERE id=?").get(id) as
    { id: string; status: string; entity_type: string } | undefined
  if (!cc) return NextResponse.json({ error: "Cycle count not found" }, { status: 404 })
  if (cc.status === "COMPLETED") return NextResponse.json({ error: "Cycle count is already completed" }, { status: 409 })
  if (cc.status === "DRAFT") return NextResponse.json({ error: "Cycle count must be IN_PROGRESS before approval" }, { status: 409 })

  const lines = db.prepare(
    "SELECT * FROM cycle_count_lines WHERE cycle_count_id=?"
  ).all(id) as { id: number; entity_id: string; system_qty: number; counted_qty: number | null; variance: number | null }[]

  const uncounted = lines.filter(l => l.counted_qty == null)
  if (uncounted.length > 0) {
    return NextResponse.json(
      { error: `${uncounted.length} line(s) have not been counted yet` },
      { status: 409 }
    )
  }

  const table = cc.entity_type === "raw_material" ? "raw_materials" : "products"
  const now   = new Date().toISOString()

  let adjustedCount = 0

  db.transaction(() => {
    for (const line of lines) {
      const variance = line.variance ?? 0
      if (variance === 0) continue

      // Adjust stock
      db.prepare(`UPDATE ${table} SET current_stock = current_stock + ? WHERE id=?`)
        .run(variance, line.entity_id)

      // Create stock movement
      db.prepare(`
        INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        cc.entity_type, line.entity_id,
        variance, `Cycle count variance adjustment`,
        "cycle_count", id,
        auth.id, now
      )

      adjustedCount++
    }

    // Complete the cycle count
    db.prepare(
      "UPDATE cycle_counts SET status='COMPLETED', completed_at=? WHERE id=?"
    ).run(now, id)

    writeAuditLog(db, {
      userId: auth.id,
      action: "CYCLE_COUNT_APPROVED",
      entityType: "cycle_count",
      entityId: id,
      after: {
        status: "COMPLETED",
        totalLines: lines.length,
        adjustedLines: adjustedCount,
      },
    })
  })()

  const varianceLines = lines.filter(l => (l.variance ?? 0) !== 0)
  return NextResponse.json({
    cycleCountId: id,
    status: "COMPLETED",
    completedAt: now,
    totalLines: lines.length,
    varianceLines: varianceLines.length,
    adjustmentsPosted: adjustedCount,
  })
}
