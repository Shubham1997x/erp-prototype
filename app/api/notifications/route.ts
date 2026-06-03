import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)))
  const offset = (page - 1) * limit
  const isReadFilter = searchParams.get("is_read")

  const db = getDb()

  const conditions: string[] = ["(user_id = ? OR role = ?)"]
  const baseParams: unknown[] = [auth.id, auth.role]

  if (isReadFilter !== null) {
    conditions.push("is_read = ?")
    baseParams.push(isReadFilter === "true" || isReadFilter === "1" ? 1 : 0)
  }

  const where = `WHERE ${conditions.join(" AND ")}`

  const total = (
    db.prepare(`SELECT COUNT(*) as cnt FROM notifications ${where}`).get(...baseParams) as { cnt: number }
  ).cnt

  const unreadCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE (user_id = ? OR role = ?) AND is_read = 0`)
      .get(auth.id, auth.role) as { cnt: number }
  ).cnt

  const data = db.prepare(`
    SELECT * FROM notifications
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...baseParams, limit, offset)

  const response = NextResponse.json({ data, total, page, limit })
  response.headers.set("X-Unread-Count", String(unreadCount))
  return response
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  let body: { markAllRead?: boolean; ids?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { markAllRead, ids } = body

  if (!markAllRead && (!ids || ids.length === 0)) {
    return NextResponse.json({ error: "Provide markAllRead: true or ids: [...]" }, { status: 400 })
  }

  const db = getDb()

  if (markAllRead) {
    db.prepare(`
      UPDATE notifications SET is_read = 1
      WHERE (user_id = ? OR role = ?) AND is_read = 0
    `).run(auth.id, auth.role)
    return NextResponse.json({ success: true, message: "All notifications marked as read" })
  }

  // Mark specific IDs — only those belonging to this user/role
  const placeholders = (ids as string[]).map(() => "?").join(", ")
  db.prepare(`
    UPDATE notifications SET is_read = 1
    WHERE id IN (${placeholders}) AND (user_id = ? OR role = ?)
  `).run(...(ids as string[]), auth.id, auth.role)

  return NextResponse.json({ success: true, message: `${(ids as string[]).length} notification(s) marked as read` })
}
