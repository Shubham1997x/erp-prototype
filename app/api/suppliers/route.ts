import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    contact: r.contact,
    leadTimeDays: r.lead_time_days,
    paymentTerms: r.payment_terms,
  }
}

export async function GET() {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM suppliers ORDER BY name ASC").all() as Record<string, unknown>[]
  return NextResponse.json(rows.map(row))
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = getDb()
  const id = `sup-${Date.now()}`
  
  db.prepare(`
    INSERT INTO suppliers (id, name, contact, lead_time_days, payment_terms)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, body.name, body.contact ?? "", body.leadTimeDays ?? 7, body.paymentTerms ?? "Net 30")
  
  const created = db.prepare("SELECT * FROM suppliers WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
