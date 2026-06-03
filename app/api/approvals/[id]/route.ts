import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"

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

  const approval = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as
    | {
        id: string
        entity_type: string
        entity_id: string
        requested_by: string
        required_role: string
        status: string
        approved_by: string | null
        rejected_by: string | null
      }
    | undefined

  if (!approval) return NextResponse.json({ error: "Approval not found" }, { status: 404 })

  if (approval.status !== "PENDING") {
    return NextResponse.json({ error: `Approval is already ${approval.status}` }, { status: 400 })
  }

  let body: { action: "APPROVE" | "REJECT"; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { action, reason } = body

  if (!action || !["APPROVE", "REJECT"].includes(action)) {
    return NextResponse.json({ error: "action must be APPROVE or REJECT" }, { status: 400 })
  }

  // Validate the acting user has the required role (or is Admin)
  if (!auth.isAdmin && auth.role !== approval.required_role) {
    return NextResponse.json(
      { error: `Only users with role '${approval.required_role}' (or Admin) can action this approval` },
      { status: 403 }
    )
  }

  const now = new Date().toISOString()

  db.transaction(() => {
    if (action === "APPROVE") {
      db.prepare(`
        UPDATE approvals SET status = 'APPROVED', approved_by = ?, approved_at = ? WHERE id = ?
      `).run(auth.id, now, id)
    } else {
      db.prepare(`
        UPDATE approvals SET status = 'REJECTED', rejected_by = ?, rejected_at = ?, rejection_reason = ? WHERE id = ?
      `).run(auth.id, now, reason ?? null, id)
    }

    writeAuditLog(db, {
      userId: auth.id,
      action: action === "APPROVE" ? "APPROVED" : "REJECTED",
      entityType: "approval",
      entityId: id,
      before: { status: "PENDING" },
      after: { status: action === "APPROVE" ? "APPROVED" : "REJECTED", reason },
      details: `${action} approval for ${approval.entity_type} ${approval.entity_id}`,
    })

    createNotification(db, {
      userId: approval.requested_by,
      type: action === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
      title: `Approval ${action === "APPROVE" ? "Approved" : "Rejected"}: ${approval.entity_type}`,
      message:
        action === "APPROVE"
          ? `Your approval request for ${approval.entity_type} ${approval.entity_id} has been approved.`
          : `Your approval request for ${approval.entity_type} ${approval.entity_id} was rejected. Reason: ${reason ?? "No reason provided"}`,
      entityType: approval.entity_type,
      entityId: approval.entity_id,
    })
  })()

  const updated = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id)
  return NextResponse.json(updated)
}
