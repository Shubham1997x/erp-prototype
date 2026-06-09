import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { newId, hashPassword } from "@/lib/core"

export const dynamic = "force-dynamic"

const VALID_ROLES = ["Admin", "Sales Executive", "Inventory Manager"]

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { data: rows } = await getSupabase()
    .from("users")
    .select("id, name, email, role, status, last_login")
    .order("name", { ascending: true })

  return NextResponse.json(
    (rows ?? []).map((r) => ({ ...r, lastLogin: r.last_login, last_login: undefined }))
  )
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { name, email, role, password } = await req.json()

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 })
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  if (!password || password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })

  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .single()
  if (existing) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 })

  const id = newId("usr")
  await supabase.from("users").insert({
    id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role,
    status: "Active",
    password_hash: hashPassword(password),
  })

  const { data: row } = await supabase
    .from("users")
    .select("id, name, email, role, status, last_login")
    .eq("id", id)
    .single()

  return NextResponse.json({ ...row, lastLogin: row?.last_login, last_login: undefined }, { status: 201 })
}
