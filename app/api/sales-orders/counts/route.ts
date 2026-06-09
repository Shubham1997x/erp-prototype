import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const { data } = await getSupabase().from("sales_orders").select("status")

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
