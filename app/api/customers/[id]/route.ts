import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { data: r } = await getSupabase()
    .from("customers")
    .select()
    .eq("id", id)
    .eq("is_active", 1)
    .single()
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(r)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json()
  const supabase = getSupabase()
  const now = new Date().toISOString()

  const { data: before } = await supabase.from("customers").select().eq("id", id).single()
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : before.is_active

  await supabase
    .from("customers")
    .update({
      name: body.name ?? before.name,
      contact: body.contact !== undefined ? body.contact : before.contact,
      email: body.email !== undefined ? body.email : before.email,
      address: body.address !== undefined ? body.address : before.address,
      credit_limit: body.creditLimit !== undefined ? body.creditLimit : before.credit_limit,
      payment_terms: body.paymentTerms !== undefined ? body.paymentTerms : before.payment_terms,
      is_active: isActive,
      deleted_at: isActive === 1 ? null : (before.deleted_at ?? now),
      updated_at: now,
    })
    .eq("id", id)

  await writeAuditLog({
    userId: auth.id,
    action: "CUSTOMER_UPDATED",
    entityType: "customer",
    entityId: id,
    before: before as Record<string, unknown>,
    after: body,
  })

  const { data: updated } = await supabase.from("customers").select().eq("id", id).single()
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const supabase = getSupabase()

  // FK check: block delete if open orders exist
  const { data: openOrders } = await supabase
    .from("sales_orders")
    .select("id")
    .eq("customer_id", id)
    .not("status", "in", '("DELIVERED","CANCELLED","PAID")')

  if ((openOrders ?? []).length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${openOrders!.length} active sales order(s) exist for this customer. Cancel or complete them first.`,
      },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()
  await supabase.from("customers").update({ is_active: 0, deleted_at: now }).eq("id", id)

  await writeAuditLog({
    userId: auth.id,
    action: "CUSTOMER_DELETED",
    entityType: "customer",
    entityId: id,
  })

  return new Response(null, { status: 204 })
}
