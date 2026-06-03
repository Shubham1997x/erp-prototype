import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const from = url.searchParams.get("from")
  const to   = url.searchParams.get("to")

  let dateFilter = "WHERE 1=1"
  const params: unknown[] = []
  if (from) { dateFilter += " AND date(created_at) >= date(?)"; params.push(from) }
  if (to)   { dateFilter += " AND date(created_at) <= date(?)"; params.push(to)   }

  // AR: Accounts Receivable (customer invoices)
  const arRow = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0)        as total_invoiced,
      COALESCE(SUM(paid_amount), 0)  as total_collected,
      COALESCE(SUM(total - paid_amount), 0) as outstanding_ar
    FROM invoices
    ${dateFilter} AND status NOT IN ('DRAFT','CANCELLED')
  `).get(...params) as { total_invoiced: number; total_collected: number; outstanding_ar: number }

  // Overdue AR: due_date < today and not fully paid
  const overdueARRow = db.prepare(`
    SELECT COALESCE(SUM(total - paid_amount), 0) as overdue_ar
    FROM invoices
    ${dateFilter}
      AND status NOT IN ('DRAFT','CANCELLED','PAID')
      AND due_date < date('now')
      AND paid_amount < total
  `).get(...params) as { overdue_ar: number }

  // AP: Accounts Payable (supplier invoices)
  const apRow = db.prepare(`
    SELECT
      COALESCE(SUM(total - paid_amount), 0) as total_ap_outstanding
    FROM supplier_invoices
    ${dateFilter} AND status NOT IN ('CANCELLED','PAID')
  `).get(...params) as { total_ap_outstanding: number }

  // Overdue AP
  const overdueAPRow = db.prepare(`
    SELECT COALESCE(SUM(total - paid_amount), 0) as overdue_ap
    FROM supplier_invoices
    ${dateFilter}
      AND status NOT IN ('CANCELLED','PAID')
      AND due_date < date('now')
      AND paid_amount < total
  `).get(...params) as { overdue_ap: number }

  // Top unpaid customers
  const topUnpaidCustomers = db.prepare(`
    SELECT
      i.customer_id as id,
      c.name,
      SUM(i.total - i.paid_amount) as outstanding
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    ${dateFilter.replace("WHERE 1=1", "WHERE 1=1").replace(/created_at/g, "i.created_at")}
      AND i.status NOT IN ('DRAFT','CANCELLED','PAID')
      AND i.paid_amount < i.total
    GROUP BY i.customer_id
    ORDER BY outstanding DESC
    LIMIT 10
  `).all(...params) as { id: string; name: string; outstanding: number }[]

  return NextResponse.json({
    totalInvoiced:      arRow.total_invoiced,
    totalCollected:     arRow.total_collected,
    outstandingAR:      arRow.outstanding_ar,
    overdueAR:          overdueARRow.overdue_ar,
    totalAPOutstanding: apRow.total_ap_outstanding,
    overdueAP:          overdueAPRow.overdue_ap,
    topUnpaidCustomers: topUnpaidCustomers.map(c => ({
      id: c.id, name: c.name, outstanding: c.outstanding,
    })),
  })
}
