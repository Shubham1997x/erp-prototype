import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrich(r: Record<string, unknown>) {
  return {
    id: r.id, purchaseOrderId: r.purchase_order_id, supplierId: r.supplier_id,
    status: r.status, invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date, dueDate: r.due_date,
    subtotal: r.subtotal, taxAmount: r.tax_amount, total: r.total, paidAmount: r.paid_amount,
    notes: r.notes, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page   = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit  = Math.min(200, parseInt(url.searchParams.get("limit") ?? "50"))
  const offset = (page - 1) * limit

  const total = (db.prepare("SELECT COUNT(*) as n FROM supplier_invoices").get() as { n: number }).n
  const rows  = db.prepare("SELECT * FROM supplier_invoices ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(enrich), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const db   = getDb()
  const id   = newId("sinv")
  const now  = new Date().toISOString()

  if (!body.supplierId || !body.total) {
    return NextResponse.json({ error: "supplierId and total are required" }, { status: 400 })
  }

  db.prepare(`
    INSERT INTO supplier_invoices
      (id, purchase_order_id, supplier_id, status, invoice_number, invoice_date, due_date, subtotal, tax_amount, total, paid_amount, notes, created_by, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)
  `).run(id, body.purchaseOrderId ?? null, body.supplierId, "RECEIVED",
         body.invoiceNumber ?? null, body.invoiceDate ?? now.slice(0, 10),
         body.dueDate ?? null, body.subtotal ?? body.total, body.taxAmount ?? 0,
         body.total, body.notes ?? null, auth.id, now, now)

  // Link PO status to INVOICED
  if (body.purchaseOrderId) {
    db.prepare("UPDATE purchase_orders SET status='INVOICED', updated_at=? WHERE id=? AND status='RECEIVED'")
      .run(now, body.purchaseOrderId)
  }

  writeAuditLog(db, { userId: auth.id, action: "SINV_CREATED", entityType: "supplier_invoice", entityId: id, after: body })

  return NextResponse.json(enrich(db.prepare("SELECT * FROM supplier_invoices WHERE id=?").get(id) as Record<string, unknown>), { status: 201 })
}
