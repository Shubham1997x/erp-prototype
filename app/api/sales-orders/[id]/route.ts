import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { enrichOrder } from "@/lib/sales-order-enrich"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req)
    const { id } = await params
    const db = getDb()

    const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as any
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json(enrichOrder(db, order as Record<string, unknown>))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}
