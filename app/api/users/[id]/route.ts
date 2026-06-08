import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { hashPassword } from "@/lib/core"

export const dynamic = "force-dynamic"

const VALID_ROLES = ["Admin", "Sales Executive", "Inventory Manager"]

export async function PATCH(req: Request, ctx: RouteContext<"/api/users/[id]">) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try {
    auth = await requireAuth(req)
    if (!auth.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await ctx.params
  const db = getDb()
  const before = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Record<string, unknown> | undefined
  if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const body = await req.json()

  const name   = body.name   !== undefined ? String(body.name).trim()  : before.name
  const email  = body.email  !== undefined ? String(body.email).trim() : before.email
  const role   = body.role   !== undefined ? body.role                 : before.role
  const status = body.status !== undefined ? body.status               : before.status

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  if (role && !VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  if (status && !["Active", "Inactive"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

  // Prevent an admin from demoting themselves
  if (id === auth.id && role !== "Admin") {
    return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 })
  }

  let passwordClause = ""
  const params: unknown[] = [name, email, role, status]

  if (body.password) {
    if (String(body.password).length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    passwordClause = ", password_hash = ?"
    params.push(hashPassword(String(body.password)))
  }

  params.push(id)
  db.prepare(`UPDATE users SET name = ?, email = ?, role = ?, status = ?${passwordClause} WHERE id = ?`).run(...params)

  const row = db.prepare("SELECT id, name, email, role, status, last_login FROM users WHERE id = ?").get(id) as Record<string, unknown>
  return NextResponse.json({ ...row, lastLogin: row.last_login, last_login: undefined })
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/users/[id]">) {
  let auth: Awaited<ReturnType<typeof requireAuth>>
  try {
    auth = await requireAuth(req)
    if (!auth.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await ctx.params

  if (id === auth.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 })
  }

  const db = getDb()
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(id)
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // Soft-delete: deactivate instead of hard delete to preserve audit history
  db.prepare("UPDATE users SET status = 'Inactive' WHERE id = ?").run(id)

  return new Response(null, { status: 204 })
}
