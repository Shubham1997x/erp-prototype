import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function POST(req: Request, ctx: RouteContext<"/api/invoices/[id]/payment">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json()
  const db     = getDb()
  const now    = new Date().toISOString()

  if (!body.amount || body.amount <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 })
  if (!body.paymentDate) return NextResponse.json({ error: "paymentDate is required" }, { status: 400 })

  const inv = db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as
    { status: string; total: number; paid_amount: number; customer_id: string; sales_order_id: string | null } | undefined
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  if (inv.status === "VOID" || inv.status === "PAID") {
    return NextResponse.json({ error: `Invoice is already ${inv.status}` }, { status: 400 })
  }

  const outstanding = inv.total - inv.paid_amount
  if (body.amount > outstanding + 0.01) {
    return NextResponse.json({ error: `Payment ₹${body.amount} exceeds outstanding ₹${outstanding.toFixed(2)}` }, { status: 400 })
  }

  const paymentId   = newId("pay")
  const newPaid     = inv.paid_amount + body.amount
  const newStatus   = newPaid >= inv.total - 0.01 ? "PAID" : "PARTIALLY_PAID"

  db.transaction(() => {
    db.prepare(`
      INSERT INTO payments (id, invoice_id, customer_id, amount, payment_date, method, reference, notes, created_by, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(paymentId, id, inv.customer_id, body.amount, body.paymentDate,
           body.method ?? "Bank Transfer", body.reference ?? null, body.notes ?? null, auth.id, now)

    db.prepare("UPDATE invoices SET paid_amount=paid_amount+?, status=?, updated_at=? WHERE id=?")
      .run(body.amount, newStatus, now, id)

    if (newStatus === "PAID" && inv.sales_order_id) {
      db.prepare("UPDATE sales_orders SET status='PAID', updated_at=? WHERE id=? AND status IN ('INVOICED','DELIVERED')")
        .run(now, inv.sales_order_id)
    }

    writeAuditLog(db, {
      userId: auth.id, action: "PAYMENT_RECEIVED",
      entityType: "invoice", entityId: id,
      after: { amount: body.amount, method: body.method, newStatus },
    })

    if (newStatus === "PAID") {
      createNotification(db, {
        role: "Finance Manager",
        type: "INVOICE_PAID",
        title: `Invoice ${id} fully paid`,
        message: `₹${inv.total.toFixed(0)} received. Invoice closed.`,
        entityType: "invoice", entityId: id,
      })
    }
  })()

  return NextResponse.json({ id: paymentId, invoiceId: id, amount: body.amount, invoiceStatus: newStatus })
}

export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]/payment">) {
  const { id } = await ctx.params
  const db = getDb()
  const rows = db.prepare("SELECT * FROM payments WHERE invoice_id=? ORDER BY created_at").all(id)
  return NextResponse.json(rows)
}
