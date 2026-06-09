import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function row(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    contact: r.contact,
    email: r.email,
    address: r.address,
    creditLimit: r.credit_limit,
    paymentTerms: r.payment_terms,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const includeDeleted = searchParams.get("deleted") === "true"

  const { data: rows } = await getSupabase()
    .from("customers")
    .select()
    .eq("is_active", includeDeleted ? 0 : 1)
    .order("name", { ascending: true })

  return NextResponse.json((rows ?? []).map(row))
}

export async function POST(req: Request) {
  const body = await req.json()
  const supabase = getSupabase()
  const id = `cust-${Date.now()}`
  const now = new Date().toISOString()

  await supabase.from("customers").insert({
    id,
    name: body.name,
    contact: body.contact ?? "",
    email: body.email ?? "",
    address: body.address ?? "",
    credit_limit: body.creditLimit ?? 0,
    payment_terms: body.paymentTerms ?? "Net 30",
    created_at: now,
    updated_at: now,
  })

  const { data: created } = await supabase.from("customers").select().eq("id", id).single()
  return NextResponse.json(row(created as Record<string, unknown>), { status: 201 })
}
