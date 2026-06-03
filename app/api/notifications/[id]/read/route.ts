import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 })
  }

  const { id } = await params
  const db = getDb()

  const notification = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as
    | { id: string; user_id: string | null; role: string | null; is_read: number }
    | undefined

  if (!notification) return NextResponse.json({ error: "Notification not found" }, { status: 404 })

  // Ensure the notification belongs to this user or their role
  const canAccess =
    notification.user_id === auth.id || notification.role === auth.role
  if (!canAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  if (notification.is_read === 1) {
    return NextResponse.json({ success: true, message: "Already marked as read" })
  }

  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id)

  const updated = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id)
  return NextResponse.json(updated)
}
