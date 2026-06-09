import { getSupabase } from "@/lib/supabase"
import { getAuth } from "@/lib/auth"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const LIMIT = 20

function mapRows(rows: Record<string, unknown>[]) {
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    role: r.role,
    type: r.type,
    title: r.title,
    message: r.message,
    entityType: r.entity_type,
    entityId: r.entity_id,
    isRead: r.is_read === 1 || r.is_read === true,
    createdAt: r.created_at,
  }))
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = getSupabase()

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, user_id, role, type, title, message, entity_type, entity_id, is_read, created_at")
    .or(`user_id.eq.${auth.id},role.eq.${auth.role}`)
    .order("created_at", { ascending: false })
    .limit(LIMIT)

  const { count: unread } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .or(`user_id.eq.${auth.id},role.eq.${auth.role}`)
    .eq("is_read", 0)

  return NextResponse.json({ data: mapRows(rows ?? []), unread: unread ?? 0 })
}

export async function PATCH(req: Request) {
  const auth = await getAuth(req)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { all?: boolean; id?: string }
  const supabase = getSupabase()

  if (body.all) {
    await supabase
      .from("notifications")
      .update({ is_read: 1 })
      .or(`user_id.eq.${auth.id},role.eq.${auth.role}`)
      .eq("is_read", 0)
  } else if (body.id) {
    await supabase
      .from("notifications")
      .update({ is_read: 1 })
      .eq("id", body.id)
      .or(`user_id.eq.${auth.id},role.eq.${auth.role}`)
  } else {
    return NextResponse.json({ error: "Provide { all: true } or { id }" }, { status: 400 })
  }

  const { count: unread } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .or(`user_id.eq.${auth.id},role.eq.${auth.role}`)
    .eq("is_read", 0)

  return NextResponse.json({ ok: true, unread: unread ?? 0 })
}
