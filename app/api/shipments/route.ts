import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM shipments ORDER BY created_at DESC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map((r) => ({
    id: r.id, salesOrderId: r.sales_order_id, status: r.status,
    trackingNumber: r.tracking_number, carrier: r.carrier,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })))
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = getDb()
  const id = `shp-${Date.now()}`
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO shipments (id, sales_order_id, status, tracking_number, carrier, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, body.salesOrderId, "READY_TO_SHIP", body.trackingNumber ?? null, body.carrier ?? null, now, now)
  return NextResponse.json({ id, status: "READY_TO_SHIP" }, { status: 201 })
}
