import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import type { BOMStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

const BOM_TRANSITIONS: Record<BOMStatus, BOMStatus[]> = {
  DRAFT:        ["ACTIVE", "ARCHIVED"],
  UNDER_REVIEW: ["ACTIVE", "DRAFT", "ARCHIVED"],
  ACTIVE:       ["ARCHIVED"],
  ARCHIVED:     [],
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/boms/[id]/status">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { status } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  const bom = db.prepare("SELECT * FROM boms WHERE id=?").get(id) as
    { product_id: string; status: BOMStatus } | undefined
  if (!bom) return NextResponse.json({ error: "BOM not found" }, { status: 404 })

  const allowed = BOM_TRANSITIONS[bom.status] ?? []
  if (!allowed.includes(status as BOMStatus)) {
    return NextResponse.json(
      { error: `Invalid transition: ${bom.status} → ${status}. Allowed: ${allowed.join(", ") || "none"}` },
      { status: 400 }
    )
  }

  // Activating a BOM: archive all other ACTIVE BOMs for this product first
  if (status === "ACTIVE") {
    const otherActive = db.prepare(
      "SELECT id FROM boms WHERE product_id=? AND status='ACTIVE' AND id != ?"
    ).all(bom.product_id, id) as { id: string }[]

    for (const other of otherActive) {
      db.prepare("UPDATE boms SET status='ARCHIVED', updated_by=?, updated_at=? WHERE id=?")
        .run(auth.id, now, other.id)
      writeAuditLog(db, {
        userId: auth.id, action: "BOM_ARCHIVED",
        entityType: "bom", entityId: other.id,
        details: `Auto-archived when BOM ${id} was activated`,
      })
    }
  }

  db.prepare("UPDATE boms SET status=?, updated_by=?, updated_at=? WHERE id=?")
    .run(status, auth.id, now, id)

  writeAuditLog(db, {
    userId: auth.id, action: `BOM_STATUS_${status}`,
    entityType: "bom", entityId: id,
    before: { status: bom.status },
    after:  { status },
  })

  return NextResponse.json({ id, status })
}
