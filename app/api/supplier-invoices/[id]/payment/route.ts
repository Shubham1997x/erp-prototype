import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: RouteContext<"/api/supplier-invoices/[id]/payment">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json()
  const db     = getDb()
  const now    = new Date().toISOString()

  if (!body.amount || body.amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 })

  const inv = db.prepare("SELECT * FROM supplier_invoices WHERE id=?").get(id) as
    { status: string; total: number; paid_amount: number; supplier_id: string; purchase_order_id: string | null } | undefined
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

  const outstanding = inv.total - inv.paid_amount
  if (body.amount > outstanding + 0.01) {
    return NextResponse.json({ error: `Payment exceeds outstanding ₹${outstanding.toFixed(2)}` }, { status: 400 })
  }

  const payId     = newId("spay")
  const newPaid   = inv.paid_amount + body.amount
  const newStatus = newPaid >= inv.total - 0.01 ? "PAID" : "APPROVED"

  db.transaction(() => {
    db.prepare(`
      INSERT INTO supplier_payments (id, supplier_invoice_id, supplier_id, amount, payment_date, method, reference, notes, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(payId, id, inv.supplier_id, body.amount, body.paymentDate ?? now.slice(0, 10),
           body.method ?? "Bank Transfer", body.reference ?? null, body.notes ?? null, auth.id, now)

    db.prepare("UPDATE supplier_invoices SET paid_amount=paid_amount+?, status=?, updated_at=? WHERE id=?")
      .run(body.amount, newStatus, now, id)

    if (newStatus === "PAID" && inv.purchase_order_id) {
      db.prepare("UPDATE purchase_orders SET status='PAID', updated_at=? WHERE id=?")
        .run(now, inv.purchase_order_id)
    }

    writeAuditLog(db, { userId: auth.id, action: "SPAY_MADE", entityType: "supplier_invoice", entityId: id, after: { amount: body.amount } })
  })()

  return NextResponse.json({ id: payId, supplierInvoiceId: id, amount: body.amount, invoiceStatus: newStatus })
}

export async function GET(_req: Request, ctx: RouteContext<"/api/supplier-invoices/[id]/payment">) {
  const { id } = await ctx.params
  const db = getDb()
  return NextResponse.json(db.prepare("SELECT * FROM supplier_payments WHERE supplier_invoice_id=? ORDER BY created_at").all(id))
}
