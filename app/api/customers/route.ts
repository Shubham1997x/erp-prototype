import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id, name: r.name, contact: r.contact, email: r.email,
    address: r.address, creditLimit: r.credit_limit, paymentTerms: r.payment_terms,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

export async function GET(req: Request) {
  const db = getDb()
  const { searchParams } = new URL(req.url)
  const includeDeleted = searchParams.get("deleted") === "true"
  const rows = db.prepare(
    includeDeleted
      ? "SELECT * FROM customers WHERE is_active=0 ORDER BY name ASC"
      : "SELECT * FROM customers WHERE is_active=1 ORDER BY name ASC"
  ).all() as Record<string, unknown>[]
  return NextResponse.json(rows.map(row))
}

export async function POST(req: Request) {
  const body = await req.json()
  const db = getDb()
  const id = `cust-${Date.now()}`
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO customers (id, name, contact, email, address, credit_limit, payment_terms, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(id, body.name, body.contact ?? "", body.email ?? "", body.address ?? "", body.creditLimit ?? 0, body.paymentTerms ?? "Net 30", now, now)
  const created = db.prepare("SELECT * FROM customers WHERE id=?").get(id) as Record<string, unknown>
  return NextResponse.json(row(created), { status: 201 })
}
