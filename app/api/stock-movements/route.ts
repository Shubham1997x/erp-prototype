import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const supabase = getSupabase()

  // Fetch movements, products, and raw materials in parallel
  const [{ data: movements }, { data: products }, { data: rawMaterials }] = await Promise.all([
    supabase
      .from("stock_movements")
      .select("id, entity_type, entity_id, delta, reason, created_by, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("products").select("id, name"),
    supabase.from("raw_materials").select("id, name"),
  ])

  const productMap = Object.fromEntries((products ?? []).map((p) => [p.id, p.name]))
  const rmMap = Object.fromEntries((rawMaterials ?? []).map((r) => [r.id, r.name]))

  const rows = (movements ?? []).map((sm) => ({
    id: sm.id,
    entityType: sm.entity_type,
    entityId: sm.entity_id,
    delta: sm.delta,
    reason: sm.reason,
    createdBy: sm.created_by,
    createdAt: sm.created_at,
    entityName:
      sm.entity_type === "raw_material" ? rmMap[sm.entity_id] : productMap[sm.entity_id],
  }))

  return NextResponse.json(rows)
}
