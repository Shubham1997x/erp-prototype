import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const { data: rows } = await getSupabase()
    .from("products")
    .select()
    .order("name", { ascending: true })

  return NextResponse.json(
    (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      unitOfMeasure: r.unit_of_measure,
      price: r.price,
      bomId: r.bom_id,
      currentStock: Math.max(0, r.current_stock as number),
      imageUrl: r.image_url,
    }))
  )
}

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = getSupabase()
  const nowStr = new Date().toISOString()
  const productId = `prod-${Date.now()}`
  const bomId = `bom-${Date.now()}`

  const defaultImages = [
    "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1618517351616-38fb9c5210c6?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1614944848172-4e0d0e8b4e25?w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1625910513956-7a2f3e6e48a7?w=600&auto=format&fit=crop",
  ]
  const finalImageUrl = body.imageUrl || defaultImages[Math.floor(Math.random() * defaultImages.length)]

  await supabase.from("products").insert({
    id: productId,
    name: body.name,
    sku: body.sku ?? `SHT-${Date.now()}`,
    unit_of_measure: body.unitOfMeasure ?? "pcs",
    price: body.price ?? 0,
    bom_id: bomId,
    current_stock: body.startingStock ?? 0,
    image_url: finalImageUrl,
  })

  await supabase.from("boms").insert({
    id: bomId,
    product_id: productId,
    version: "v1.0",
    status: "DRAFT",
    created_by: "System",
    created_at: nowStr,
  })

  if (body.startingStock && body.startingStock > 0) {
    await supabase.from("stock_movements").insert({
      entity_type: "product",
      entity_id: productId,
      delta: body.startingStock,
      reason: "Initial Stock Receipt",
      created_by: "System",
      created_at: nowStr,
    })
  }

  const { data: created } = await supabase.from("products").select().eq("id", productId).single()
  return NextResponse.json(
    {
      id: created?.id,
      name: created?.name,
      sku: created?.sku,
      unitOfMeasure: created?.unit_of_measure,
      price: created?.price,
      bomId: created?.bom_id,
      currentStock: created?.current_stock,
      imageUrl: created?.image_url,
    },
    { status: 201 }
  )
}
