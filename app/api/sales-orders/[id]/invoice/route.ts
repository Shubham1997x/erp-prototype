import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import {
  buildInvoiceHtml,
  dueDateFromIssue,
  INVOICE_ELIGIBLE_STATUSES,
  invoiceNumberForOrder,
  type InvoiceDocument,
} from "@/lib/invoice-html"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req)
    if (!auth.isSales && !auth.isAdmin) {
      return NextResponse.json({ error: "Only sales or admin can download invoices" }, { status: 403 })
    }

    const { id } = await params
    const db = getDb()

    const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const status = String(order.status)
    if (!INVOICE_ELIGIBLE_STATUSES.includes(status as (typeof INVOICE_ELIGIBLE_STATUSES)[number])) {
      return NextResponse.json(
        { error: "Invoice is available after the order has been shipped" },
        { status: 400 }
      )
    }

    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(order.customer_id) as
      | Record<string, unknown>
      | undefined

    const lineRows = db
      .prepare(
        `SELECT sol.*, p.name as product_name, p.sku
         FROM sales_order_lines sol
         LEFT JOIN products p ON p.id = sol.product_id
         WHERE sol.order_id = ?`
      )
      .all(id) as Record<string, unknown>[]

    const lines = lineRows.map((l) => {
      const qty = Number(l.qty)
      const unitPrice = Number(l.unit_price)
      const lineTotal = qty * unitPrice
      return {
        description: String(l.product_name ?? l.product_id),
        sku: l.sku ? String(l.sku) : undefined,
        qty,
        unitPrice,
        lineTotal,
      }
    })

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
    const taxAmount = 0
    const total = subtotal + taxAmount

    const issueDate =
      (order.actual_delivery_date as string) ||
      (order.updated_at as string) ||
      new Date().toISOString()

    const paymentTerms = customer ? String(customer.payment_terms ?? "") : ""
    const dueDate = dueDateFromIssue(issueDate, paymentTerms)

    const doc: InvoiceDocument = {
      invoiceNumber: invoiceNumberForOrder(id),
      orderId: id,
      issueDate,
      dueDate,
      customer: {
        name: customer ? String(customer.name) : "Unknown customer",
        email: customer ? String(customer.email ?? "") : "",
        address: customer ? String(customer.address ?? "") : "",
        contact: customer ? String(customer.contact ?? "") : "",
        paymentTerms: paymentTerms || "Net 30",
      },
      lines,
      subtotal,
      taxAmount,
      total,
      notes: order.notes ? String(order.notes) : undefined,
      trackingNumber: order.tracking_number ? String(order.tracking_number) : null,
      carrier: order.carrier ? String(order.carrier) : null,
      orderStatus: status,
    }

    const html = buildInvoiceHtml(doc)
    const filename = `${id}-invoice.html`

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unauthorized"
    const status = message === "Unauthorized" ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
