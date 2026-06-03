import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const from = url.searchParams.get("from") // YYYY-MM-DD
  const to   = url.searchParams.get("to")   // YYYY-MM-DD

  let dateFilter = "WHERE 1=1"
  const params: unknown[] = []
  if (from) { dateFilter += " AND date(so.created_at) >= date(?)"; params.push(from) }
  if (to)   { dateFilter += " AND date(so.created_at) <= date(?)"; params.push(to)   }

  // Total orders and revenue
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_orders,
      COALESCE(SUM(lines.line_total), 0) as total_revenue
    FROM sales_orders so
    LEFT JOIN (
      SELECT order_id, SUM(qty * unit_price) as line_total
      FROM sales_order_lines
      GROUP BY order_id
    ) lines ON lines.order_id = so.id
    ${dateFilter}
  `).get(...params) as { total_orders: number; total_revenue: number }

  // By status breakdown
  const byStatusRows = db.prepare(`
    SELECT status, COUNT(*) as cnt
    FROM sales_orders so
    ${dateFilter}
    GROUP BY status
  `).all(...params) as { status: string; cnt: number }[]
  const byStatus: Record<string, number> = {}
  for (const r of byStatusRows) byStatus[r.status] = r.cnt

  // Top customers (by revenue)
  const topCustomers = db.prepare(`
    SELECT
      so.customer_id,
      c.name,
      COUNT(so.id) as order_count,
      COALESCE(SUM(sol.line_total), 0) as total_revenue
    FROM sales_orders so
    JOIN customers c ON c.id = so.customer_id
    LEFT JOIN (
      SELECT order_id, SUM(qty * unit_price) as line_total
      FROM sales_order_lines
      GROUP BY order_id
    ) sol ON sol.order_id = so.id
    ${dateFilter.replace(/\bso\./g, "so.")}
    GROUP BY so.customer_id
    ORDER BY total_revenue DESC
    LIMIT 10
  `).all(...params) as { customer_id: string; name: string; order_count: number; total_revenue: number }[]

  // OTD Rate: orders delivered on or before promised date
  const otdBase = db.prepare(`
    SELECT
      COUNT(*) as total_delivered,
      SUM(CASE WHEN actual_delivery_date <= promised_delivery_date THEN 1 ELSE 0 END) as on_time
    FROM sales_orders so
    ${dateFilter} AND so.status = 'DELIVERED'
      AND so.promised_delivery_date IS NOT NULL
      AND so.actual_delivery_date IS NOT NULL
  `).get(...params) as { total_delivered: number; on_time: number }

  const otdRate = otdBase.total_delivered > 0
    ? Math.round((otdBase.on_time / otdBase.total_delivered) * 100 * 10) / 10
    : null

  // Open backorder value: ordered qty - fulfilled qty, for non-cancelled/completed orders
  const backorderRow = db.prepare(`
    SELECT COALESCE(SUM((sol.qty - sol.fulfilled_qty) * sol.unit_price), 0) as value
    FROM sales_order_lines sol
    JOIN sales_orders so ON so.id = sol.order_id
    ${dateFilter} AND so.status NOT IN ('CANCELLED','DELIVERED','INVOICED')
      AND sol.qty > sol.fulfilled_qty
  `).get(...params) as { value: number }

  const totalOrders  = summary.total_orders
  const totalRevenue = summary.total_revenue
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  return NextResponse.json({
    totalOrders,
    totalRevenue,
    averageOrderValue: Math.round(avgOrderValue * 100) / 100,
    byStatus,
    topCustomers: topCustomers.map(c => ({
      customerId: c.customer_id,
      name: c.name,
      orderCount: c.order_count,
      totalRevenue: c.total_revenue,
    })),
    otdRate,
    openBackorderValue: backorderRow.value,
  })
}
