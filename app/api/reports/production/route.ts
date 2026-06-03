import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()

  // Summary counts
  const summary = db.prepare(`
    SELECT
      SUM(CASE WHEN status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END) as active_orders,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)                     as completed_orders,
      COALESCE(SUM(produced_qty), 0)                                              as total_produced,
      COALESCE(SUM(scrapped_qty), 0)                                              as total_scrapped
    FROM production_orders
  `).get() as {
    active_orders: number;
    completed_orders: number;
    total_produced: number;
    total_scrapped: number;
  }

  const scrapRate = (summary.total_produced + summary.total_scrapped) > 0
    ? Math.round((summary.total_scrapped / (summary.total_produced + summary.total_scrapped)) * 100 * 10) / 10
    : 0

  // By status breakdown
  const byStatusRows = db.prepare(`
    SELECT status, COUNT(*) as cnt
    FROM production_orders
    GROUP BY status
  `).all() as { status: string; cnt: number }[]
  const byStatus: Record<string, number> = {}
  for (const r of byStatusRows) byStatus[r.status] = r.cnt

  // Average cycle time (only for completed orders with both start and end dates)
  const cycleTimeRow = db.prepare(`
    SELECT AVG(
      CAST((julianday(actual_end) - julianday(actual_start)) AS REAL)
    ) as avg_days
    FROM production_orders
    WHERE status = 'COMPLETED'
      AND actual_start IS NOT NULL
      AND actual_end IS NOT NULL
  `).get() as { avg_days: number | null }

  const avgCycleTimeDays = cycleTimeRow.avg_days != null
    ? Math.round(cycleTimeRow.avg_days * 10) / 10
    : null

  // Recent completions (last 10)
  const recentCompletions = db.prepare(`
    SELECT po.id, p.name as product_name, po.qty, po.produced_qty, po.scrapped_qty,
           po.actual_start, po.actual_end, po.status
    FROM production_orders po
    LEFT JOIN products p ON p.id = po.product_id
    WHERE po.status = 'COMPLETED'
    ORDER BY po.actual_end DESC
    LIMIT 10
  `).all() as Record<string, unknown>[]

  return NextResponse.json({
    activeOrders:    summary.active_orders,
    completedOrders: summary.completed_orders,
    totalProduced:   summary.total_produced,
    totalScrapped:   summary.total_scrapped,
    scrapRate,
    byStatus,
    avgCycleTimeDays,
    recentCompletions: recentCompletions.map(r => ({
      id: r.id,
      productName: r.product_name,
      qty: r.qty,
      producedQty: r.produced_qty,
      scrappedQty: r.scrapped_qty,
      actualStart: r.actual_start,
      actualEnd: r.actual_end,
      status: r.status,
    })),
  })
}
