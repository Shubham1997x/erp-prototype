import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id, name: r.name, contact: r.contact,
    leadTimeDays: r.lead_time_days, paymentTerms: r.payment_terms,
    onTimeDeliveryRate: r.on_time_delivery_rate ?? 0,
    qualityRating: r.quality_rating ?? 0,
    isActive: r.is_active !== 0,
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/api/suppliers/[id]">) {
  const { id } = await ctx.params
  const db = getDb()
  const r = db.prepare("SELECT * FROM suppliers WHERE id=? AND is_active=1").get(id) as Record<string, unknown> | undefined
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(row(r))
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/suppliers/[id]">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json()
  const db     = getDb()

  const before = db.prepare("SELECT * FROM suppliers WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  db.prepare(`
    UPDATE suppliers
    SET name=?, contact=?, lead_time_days=?, payment_terms=?,
        on_time_delivery_rate=COALESCE(?, on_time_delivery_rate),
        quality_rating=COALESCE(?, quality_rating)
    WHERE id=?
  `).run(body.name, body.contact, body.leadTimeDays, body.paymentTerms,
         body.onTimeDeliveryRate ?? null, body.qualityRating ?? null, id)

  writeAuditLog(db, {
    userId: auth.id, action: "SUPPLIER_UPDATED", entityType: "supplier", entityId: id,
    before: before as Record<string, unknown>, after: body,
  })

  return NextResponse.json(row(db.prepare("SELECT * FROM suppliers WHERE id=?").get(id) as Record<string, unknown>))
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/suppliers/[id]">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const db     = getDb()

  // FK check: active raw materials sourced from this supplier
  const linkedMaterials = db.prepare(
    "SELECT COUNT(*) as n FROM raw_materials WHERE supplier_id=? AND is_active=1"
  ).get(id) as { n: number }

  if (linkedMaterials.n > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${linkedMaterials.n} active raw material(s) are sourced from this supplier. Reassign them first.` },
      { status: 409 }
    )
  }

  const openPOs = db.prepare(
    "SELECT COUNT(*) as n FROM purchase_orders WHERE supplier_id=? AND status NOT IN ('RECEIVED','CANCELLED','PAID')"
  ).get(id) as { n: number }

  if (openPOs.n > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${openPOs.n} open purchase order(s) exist for this supplier.` },
      { status: 409 }
    )
  }

  db.prepare("UPDATE suppliers SET is_active=0, deleted_at=datetime('now') WHERE id=?").run(id)

  writeAuditLog(db, { userId: auth.id, action: "SUPPLIER_DELETED", entityType: "supplier", entityId: id })

  return new Response(null, { status: 204 })
}
