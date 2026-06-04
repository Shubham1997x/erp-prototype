import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getDb()

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 })

    return NextResponse.json({
      id: product.id,
      name: product.name,
      sku: product.sku,
      unitOfMeasure: product.unit_of_measure,
      price: product.price,
      bomId: product.bom_id,
      currentStock: product.current_stock,
      reservedStock: product.reserved_stock,
      unitCost: product.unit_cost,
      standardCost: product.standard_cost,
      category: product.category,
      isActive: product.is_active === 1,
      imageUrl: product.image_url,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
