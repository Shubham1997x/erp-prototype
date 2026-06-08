import { getDb } from "@/lib/db"
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

  const db = getDb()
  const rows = (db.prepare("SELECT id, name, email, role, status, last_login FROM users ORDER BY name ASC").all() as Record<string, unknown>[])
    .map(r => ({ ...r, lastLogin: r.last_login, last_login: undefined }))
  return NextResponse.json(rows)
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
  if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })

  const db = getDb()
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim().toLowerCase())
  if (existing) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 })

  const id = newId("usr")
  db.prepare(
    "INSERT INTO users (id, name, email, role, status, password_hash) VALUES (?, ?, ?, ?, 'Active', ?)"
  ).run(id, name.trim(), email.trim().toLowerCase(), role, hashPassword(password))

  const row = db.prepare("SELECT id, name, email, role, status, last_login FROM users WHERE id = ?").get(id) as Record<string, unknown>
  return NextResponse.json({ ...row, lastLogin: row.last_login, last_login: undefined }, { status: 201 })
}
