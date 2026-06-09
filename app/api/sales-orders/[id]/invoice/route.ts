import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase"
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
    const supabase = getSupabase()

    const { data: order } = await supabase.from("sales_orders").select().eq("id", id).single()
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

    const status = String(order.status)
    if (!INVOICE_ELIGIBLE_STATUSES.includes(status as (typeof INVOICE_ELIGIBLE_STATUSES)[number])) {
      return NextResponse.json(
        { error: "Invoice is available after the order has been shipped" },
        { status: 400 }
      )
    }

    const { data: customer } = await supabase
      .from("customers")
      .select()
      .eq("id", order.customer_id)
      .single()

    const { data: lineRows } = await supabase
      .from("sales_order_lines")
      .select("*, products(name, sku)")
      .eq("order_id", id)

    const lines = (lineRows ?? []).map((l: any) => {
      const qty = Number(l.qty)
      const unitPrice = Number(l.unit_price)
      const gstRate = Number(l.gst_rate ?? 0)
      const lineTotal = qty * unitPrice
      const lineTax = Math.round(lineTotal * gstRate) / 100
      return {
        description: String(l.products?.name ?? l.product_id),
        sku: l.products?.sku ? String(l.products.sku) : undefined,
        qty,
        unitPrice,
        gstRate,
        lineTotal,
        lineTax,
      }
    })

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0)
    const taxAmount = lines.reduce((s, l) => s + l.lineTax, 0)
    const total = subtotal + taxAmount

    const issueDate =
      order.actual_delivery_date || order.updated_at || new Date().toISOString()
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
