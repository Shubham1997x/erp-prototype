import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrich(db: ReturnType<typeof getDb>, r: Record<string, unknown>) {
  const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id=?").all(r.id) as Record<string, unknown>[]
  return {
    id: r.id, salesOrderId: r.sales_order_id, shipmentId: r.shipment_id,
    customerId: r.customer_id, status: r.status,
    issueDate: r.issue_date, dueDate: r.due_date,
    subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total, paidAmount: r.paid_amount,
    notes: r.notes, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    lines: lines.map(l => ({
      id: l.id, productId: l.product_id, description: l.description,
      qty: l.qty, unitPrice: l.unit_price, taxRate: l.tax_rate, lineTotal: l.line_total,
    })),
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page   = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit  = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"))
  const offset = (page - 1) * limit
  const status = url.searchParams.get("status")
  const customerId = url.searchParams.get("customerId")

  let where = "WHERE 1=1"
  const params: unknown[] = []
  if (status)     { where += " AND status=?";      params.push(status) }
  if (customerId) { where += " AND customer_id=?"; params.push(customerId) }

  const total = (db.prepare(`SELECT COUNT(*) as n FROM invoices ${where}`).get(...params) as { n: number }).n
  const rows  = db.prepare(`SELECT * FROM invoices ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(r => enrich(db, r)), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const db   = getDb()
  const id   = newId("inv")
  const now  = new Date().toISOString()

  if (!body.customerId) return NextResponse.json({ error: "customerId is required" }, { status: 400 })
  if (!body.lines?.length) return NextResponse.json({ error: "At least one line is required" }, { status: 400 })

  const subtotal  = body.lines.reduce((s: number, l: { qty: number; unitPrice: number; taxRate?: number }) => s + l.qty * l.unitPrice, 0)
  const taxAmount = body.lines.reduce((s: number, l: { qty: number; unitPrice: number; taxRate?: number }) => s + (l.qty * l.unitPrice * (l.taxRate ?? 0)) / 100, 0)
  const total     = subtotal + taxAmount

  // Issue date defaults to today, due date based on customer payment terms
  const customer  = db.prepare("SELECT payment_terms FROM customers WHERE id=?").get(body.customerId) as { payment_terms: string } | undefined
  const netDays   = parseInt(customer?.payment_terms?.replace(/\D/g, "") ?? "30") || 30
  const issueDate = body.issueDate ?? now.slice(0, 10)
  const dueDate   = body.dueDate   ?? addDays(issueDate, netDays)

  db.transaction(() => {
    db.prepare(`
      INSERT INTO invoices
        (id, sales_order_id, shipment_id, customer_id, status, issue_date, due_date, subtotal, tax_amount, total, paid_amount, notes, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)
    `).run(id, body.salesOrderId ?? null, body.shipmentId ?? null, body.customerId,
           body.status ?? "ISSUED", issueDate, dueDate, subtotal, taxAmount, total,
           body.notes ?? null, auth.id, now, now)

    for (const l of body.lines) {
      const lineTotal = l.qty * l.unitPrice + (l.qty * l.unitPrice * (l.taxRate ?? 0)) / 100
      db.prepare(`
        INSERT INTO invoice_lines (invoice_id, product_id, description, qty, unit_price, tax_rate, line_total)
        VALUES (?,?,?,?,?,?,?)
      `).run(id, l.productId ?? null, l.description ?? null, l.qty, l.unitPrice, l.taxRate ?? 0, lineTotal)
    }

    // Update SO status to INVOICED if linked
    if (body.salesOrderId) {
      db.prepare("UPDATE sales_orders SET status='INVOICED', updated_at=? WHERE id=? AND status='DELIVERED'")
        .run(now, body.salesOrderId)
    }

    writeAuditLog(db, {
      userId: auth.id, action: "INVOICE_CREATED", entityType: "invoice", entityId: id,
      after: { customerId: body.customerId, total, lines: body.lines.length },
    })
  })()

  return NextResponse.json(enrich(db, db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as Record<string, unknown>), { status: 201 })
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
