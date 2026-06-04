import { getDb } from "@/lib/db"
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
    isRead: r.is_read === 1,
    createdAt: r.created_at,
  }))
}

export async function GET(req: Request) {
  const auth = await getAuth(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const db = getDb()
  const rows = db
    .prepare(
      `
    SELECT id, user_id, role, type, title, message, entity_type, entity_id, is_read, created_at
    FROM notifications
    WHERE user_id = ? OR role = ?
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(auth.id, auth.role, LIMIT) as Record<string, unknown>[]

  const unread = (
    db
      .prepare(
        `
    SELECT COUNT(*) as n FROM notifications
    WHERE (user_id = ? OR role = ?) AND is_read = 0
  `
      )
      .get(auth.id, auth.role) as { n: number }
  ).n

  return NextResponse.json({ data: mapRows(rows), unread })
}

export async function PATCH(req: Request) {
  const auth = await getAuth(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { all?: boolean; id?: string }
  const db = getDb()

  if (body.all) {
    db.prepare(
      `
      UPDATE notifications SET is_read = 1
      WHERE (user_id = ? OR role = ?) AND is_read = 0
    `
    ).run(auth.id, auth.role)
  } else if (body.id) {
    db.prepare(
      `
      UPDATE notifications SET is_read = 1
      WHERE id = ? AND (user_id = ? OR role = ?)
    `
    ).run(body.id, auth.id, auth.role)
  } else {
    return NextResponse.json({ error: "Provide { all: true } or { id }" }, { status: 400 })
  }

  const unread = (
    db
      .prepare(
        `
    SELECT COUNT(*) as n FROM notifications
    WHERE (user_id = ? OR role = ?) AND is_read = 0
  `
      )
      .get(auth.id, auth.role) as { n: number }
  ).n

  return NextResponse.json({ ok: true, unread })
}
