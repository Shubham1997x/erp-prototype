import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

function mapProduct(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku,
    unitOfMeasure: r.unit_of_measure,
    price: r.price,
    bomId: r.bom_id,
    currentStock: Math.max(0, r.current_stock as number),
    reservedStock: r.reserved_stock ?? 0,
    unitCost: r.unit_cost,
    standardCost: r.standard_cost,
    category: r.category,
    isActive: r.is_active === 1 || r.is_active === true,
    imageUrl: r.image_url,
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: product } = await getSupabase()
      .from("products")
      .select()
      .eq("id", id)
      .single()

    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })
    return NextResponse.json(mapProduct(product as Record<string, unknown>))
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  if (!auth.isAdmin && !auth.isInventory) {
    return NextResponse.json({ error: "Only inventory or admin can edit products" }, { status: 403 })
  }

  const { id } = await params
  const supabase = getSupabase()

  const { data: before } = await supabase.from("products").select().eq("id", id).single()
  if (!before) return NextResponse.json({ error: "Product not found" }, { status: 404 })

  const body = await req.json()

  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 })
  }
  if (body.price !== undefined && Number(body.price) <= 0) {
    return NextResponse.json({ error: "Price must be greater than 0" }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    name: body.name !== undefined ? String(body.name).trim() : before.name,
    sku: body.sku !== undefined ? String(body.sku).trim() || before.sku : before.sku,
    unit_of_measure: body.unitOfMeasure !== undefined ? String(body.unitOfMeasure) : before.unit_of_measure,
    price: body.price !== undefined ? Number(body.price) : before.price,
    image_url: body.imageUrl !== undefined ? body.imageUrl : before.image_url,
    category: body.category !== undefined ? body.category || null : before.category,
    standard_cost: body.standardCost !== undefined ? Number(body.standardCost) || null : before.standard_cost,
    unit_cost: body.unitCost !== undefined ? Number(body.unitCost) || null : before.unit_cost,
    is_active: body.isActive !== undefined ? (body.isActive ? 1 : 0) : before.is_active,
  }

  await supabase.from("products").update(update).eq("id", id)

  const { data: after } = await supabase.from("products").select().eq("id", id).single()

  await writeAuditLog({
    userId: auth.id,
    action: "PRODUCT_UPDATED",
    entityType: "product",
    entityId: id,
    before: mapProduct(before as Record<string, unknown>),
    after: mapProduct(after as Record<string, unknown>),
  })

  return NextResponse.json(mapProduct(after as Record<string, unknown>))
}
