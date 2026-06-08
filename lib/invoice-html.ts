export interface InvoiceLine {
  description: string
  sku?: string
  qty: number
  unitPrice: number
  gstRate?: number
  lineTax?: number
  lineTotal: number
}

export interface InvoiceDocument {
  invoiceNumber: string
  orderId: string
  issueDate: string
  dueDate: string
  customer: {
    name: string
    email: string
    address: string
    contact: string
    paymentTerms: string
  }
  lines: InvoiceLine[]
  subtotal: number
  taxAmount: number
  total: number
  notes?: string
  trackingNumber?: string | null
  carrier?: string | null
  orderStatus: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function buildInvoiceHtml(doc: InvoiceDocument): string {
  const hasGst = doc.lines.some((l) => (l.gstRate ?? 0) > 0)

  const lineRows = doc.lines
    .map(
      (l) => `
        <tr>
          <td>
            <div class="item-name">${escapeHtml(l.description)}</div>
            ${l.sku ? `<div class="item-sku">${escapeHtml(l.sku)}</div>` : ""}
          </td>
          <td class="num">${l.qty}</td>
          <td class="num">${escapeHtml(formatINR(l.unitPrice))}</td>
          ${hasGst ? `<td class="num">${l.gstRate ? `${l.gstRate}%` : "—"}</td>` : ""}
          <td class="num">${escapeHtml(formatINR(l.lineTotal))}</td>
        </tr>`
    )
    .join("")

  const logistics =
    doc.carrier || doc.trackingNumber
      ? `<p class="meta"><strong>Shipment:</strong> ${escapeHtml(doc.carrier || "—")}${
          doc.trackingNumber ? ` · Tracking ${escapeHtml(doc.trackingNumber)}` : ""
        }</p>`
      : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(doc.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; margin: 0; padding: 32px; background: #f8fafc; }
    .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 40px; border: 1px solid #e2e8f0; border-radius: 8px; }
    h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: -0.02em; }
    .brand { font-size: 13px; color: #64748b; margin-bottom: 32px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px; }
    .block p { margin: 0 0 4px; font-size: 14px; line-height: 1.5; }
    .invoice-meta { text-align: right; }
    .invoice-meta .num { font-size: 18px; font-weight: 700; font-family: ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; border-bottom: 2px solid #e2e8f0; padding: 10px 8px; }
    th.num, td.num { text-align: right; }
    td { padding: 12px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .item-name { font-weight: 600; }
    .item-sku { font-size: 12px; color: #64748b; margin-top: 2px; }
    .totals { margin-left: auto; width: 280px; font-size: 14px; }
    .totals row { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .grand { border-top: 2px solid #111; margin-top: 8px; padding-top: 12px; font-size: 18px; font-weight: 700; }
    .notes { margin-top: 28px; padding: 16px; background: #f8fafc; border-radius: 6px; font-size: 13px; color: #475569; }
    .meta { font-size: 13px; color: #475569; margin-top: 16px; }
    .footer { margin-top: 40px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print {
      body { background: #fff; padding: 0; }
      .page { border: none; box-shadow: none; padding: 24px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">ShirtCo Manufacturing · Tax Invoice</div>
    <h1>Invoice</h1>
    <div class="grid">
      <div class="block">
        <div class="label">Bill to</div>
        <p><strong>${escapeHtml(doc.customer.name)}</strong></p>
        <p>${escapeHtml(doc.customer.address || "—")}</p>
        <p>${escapeHtml(doc.customer.email || "")}</p>
        ${doc.customer.contact ? `<p>${escapeHtml(doc.customer.contact)}</p>` : ""}
        <p class="meta">Payment terms: ${escapeHtml(doc.customer.paymentTerms || "As agreed")}</p>
      </div>
      <div class="block invoice-meta">
        <div class="label">Invoice details</div>
        <p class="num">${escapeHtml(doc.invoiceNumber)}</p>
        <p><strong>Order:</strong> ${escapeHtml(doc.orderId)}</p>
        <p><strong>Issue date:</strong> ${escapeHtml(formatDate(doc.issueDate))}</p>
        <p><strong>Due date:</strong> ${escapeHtml(formatDate(doc.dueDate))}</p>
        <p><strong>Status:</strong> ${escapeHtml(doc.orderStatus)}</p>
      </div>
    </div>
    ${logistics}
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          ${hasGst ? `<th class="num">GST</th>` : ""}
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${escapeHtml(formatINR(doc.subtotal))}</span></div>
      ${doc.taxAmount > 0 ? `<div class="row"><span>GST</span><span>${escapeHtml(formatINR(doc.taxAmount))}</span></div>` : ""}
      <div class="row grand"><span>Total due</span><span>${escapeHtml(formatINR(doc.total))}</span></div>
    </div>
    ${
      doc.notes
        ? `<div class="notes"><strong>Notes</strong><br />${escapeHtml(doc.notes)}</div>`
        : ""
    }
    <p class="footer">Generated by ShirtCo ERP · Order ${escapeHtml(doc.orderId)}</p>
  </div>
</body>
</html>`
}

export const INVOICE_ELIGIBLE_STATUSES = ["SHIPPED", "DELIVERED", "INVOICED", "PAID"] as const

export function invoiceNumberForOrder(orderId: string): string {
  return `INV-${orderId}`
}

/** Parse simple payment terms (e.g. "Net 30") into days for due date. */
export function paymentTermsDays(terms: string | null | undefined): number {
  if (!terms) return 30
  const m = terms.match(/(\d+)/)
  return m ? Math.min(365, Math.max(1, parseInt(m[1], 10))) : 30
}

export function dueDateFromIssue(issueIso: string, terms: string | null | undefined): string {
  const d = new Date(issueIso)
  d.setDate(d.getDate() + paymentTermsDays(terms))
  return d.toISOString()
}
