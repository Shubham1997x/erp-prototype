import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req)
    const { id } = await params
    const db = getDb()

    const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(id) as any
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const lines = db.prepare("SELECT * FROM sales_order_lines WHERE order_id = ?").all(id) as any[]

    const data = {
      id: order.id,
      customerId: order.customer_id,
      status: order.status,
      notes: order.notes,
      createdBy: order.created_by,
      updatedBy: order.updated_by,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      requestedDeliveryDate: order.requested_delivery_date,
      promisedDeliveryDate:  order.promised_delivery_date,
      actualDeliveryDate:    order.actual_delivery_date,
      parentOrderId: order.parent_order_id,
      revisionNumber: order.revision_number ?? 1,
      approvalStatus: order.approval_status ?? "PENDING",
      creditCheckPassed: order.credit_check_passed === 1,
      tracking_number: order.tracking_number,
      carrier: order.carrier,
      lines: lines.map((l: any) => ({
        id: l.id,
        productId: l.product_id,
        qty: l.qty,
        unitPrice: l.unit_price,
        fulfilledQty: l.fulfilled_qty ?? 0,
      })),
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
}
