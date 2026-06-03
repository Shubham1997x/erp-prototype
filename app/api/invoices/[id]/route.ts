import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  const { id } = await ctx.params
  const db     = getDb()
  const r = db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id=?").all(id) as Record<string, unknown>[]
  return NextResponse.json({
    ...r,
    lines: lines.map(l => ({ id: l.id, productId: l.product_id, description: l.description, qty: l.qty, unitPrice: l.unit_price, taxRate: l.tax_rate, lineTotal: l.line_total })),
  })
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  const { id } = await ctx.params
  const { status, notes, dueDate } = await req.json()
  const db = getDb()
  const now = new Date().toISOString()

  const inv = db.prepare("SELECT * FROM invoices WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 })

  db.prepare("UPDATE invoices SET status=COALESCE(?,status), notes=COALESCE(?,notes), due_date=COALESCE(?,due_date), updated_at=? WHERE id=?")
    .run(status ?? null, notes ?? null, dueDate ?? null, now, id)

  return NextResponse.json({ id, status: status ?? inv.status })
}
