import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, ctx: RouteContext<"/api/customers/[id]">) {
  const { id } = await ctx.params
  const db = getDb()
  const r = db.prepare("SELECT * FROM customers WHERE id=? AND is_active=1").get(id) as Record<string, unknown> | undefined
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(r)
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/customers/[id]">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json()
  const db     = getDb()
  const now    = new Date().toISOString()

  const before = db.prepare("SELECT * FROM customers WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  db.prepare(`
    UPDATE customers
    SET name=?, contact=?, email=?, address=?, credit_limit=?, payment_terms=?, updated_at=?
    WHERE id=?
  `).run(body.name, body.contact, body.email, body.address, body.creditLimit, body.paymentTerms, now, id)

  writeAuditLog(db, {
    userId: auth.id, action: "CUSTOMER_UPDATED", entityType: "customer", entityId: id,
    before: before as Record<string, unknown>, after: body,
  })

  return NextResponse.json(db.prepare("SELECT * FROM customers WHERE id=?").get(id))
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/customers/[id]">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const db     = getDb()

  // FK check: block delete if open (non-terminal) orders exist
  const openOrders = db.prepare(`
    SELECT COUNT(*) as n FROM sales_orders
    WHERE customer_id=? AND status NOT IN ('DELIVERED','CANCELLED','PAID')
  `).get(id) as { n: number }

  if (openOrders.n > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${openOrders.n} active sales order(s) exist for this customer. Cancel or complete them first.` },
      { status: 409 }
    )
  }

  // Soft delete
  const now = new Date().toISOString()
  db.prepare("UPDATE customers SET is_active=0, deleted_at=? WHERE id=?").run(now, id)

  writeAuditLog(db, {
    userId: auth.id, action: "CUSTOMER_DELETED", entityType: "customer", entityId: id,
  })

  return new Response(null, { status: 204 })
}
