import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"
import { PROD_TRANSITIONS } from "@/lib/types"
import type { ProductionStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, ctx: RouteContext<"/api/production-orders/[id]/status">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { status, plannedStart, plannedEnd, workCenterId } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  try {
    const result = db.transaction(() => {
      const po = db.prepare("SELECT * FROM production_orders WHERE id=?").get(id) as
        Record<string, unknown> | undefined
      if (!po) throw new Error("Production order not found")

      const current = po.status as ProductionStatus

      // ── Transition guard ─────────────────────────────────────────────────
      const allowed = PROD_TRANSITIONS[current] ?? []
      if (!allowed.includes(status as ProductionStatus)) {
        throw new Error(`Invalid transition: ${current} → ${status}. Allowed: ${allowed.join(", ") || "none"}`)
      }

      // ── MATERIAL_RESERVED: check + reserve raw materials ──────────────────
      if (status === "MATERIAL_RESERVED") {
        const components = db.prepare("SELECT * FROM bom_components WHERE bom_id=?")
          .all(po.bom_id as string) as { material_id: string; qty_per_unit: number }[]

        for (const comp of components) {
          const needed = comp.qty_per_unit * (po.qty as number)
          const rm = db.prepare("SELECT current_stock, name FROM raw_materials WHERE id=?")
            .get(comp.material_id) as { current_stock: number; name: string } | undefined

          if (!rm || rm.current_stock < needed) {
            throw new Error(
              `Insufficient stock for "${rm?.name ?? comp.material_id}". Required: ${needed}, Available: ${rm?.current_stock ?? 0}`
            )
          }

          // Create source-traced reservation
          const resId = newId("res")
          db.prepare(`
            INSERT INTO inventory_reservations
              (id, entity_type, entity_id, reserved_qty, reservation_type, reference_id, reference_type, created_by)
            VALUES (?, 'raw_material', ?, ?, 'production_order', ?, 'production_order', ?)
          `).run(resId, comp.material_id, needed, id, auth.id)

          db.prepare("UPDATE raw_materials SET reserved_stock = reserved_stock + ? WHERE id=?")
            .run(needed, comp.material_id)
        }
      }

      // ── IN_PROGRESS: record actual start ─────────────────────────────────
      if (status === "IN_PROGRESS" && !po.actual_start) {
        db.prepare("UPDATE production_orders SET actual_start=? WHERE id=?").run(now, id)
      }

      // ── ON_HOLD / CANCELLED: release reservations ─────────────────────────
      if (["ON_HOLD", "CANCELLED"].includes(status) && current === "MATERIAL_RESERVED") {
        const components = db.prepare("SELECT * FROM bom_components WHERE bom_id=?")
          .all(po.bom_id as string) as { material_id: string; qty_per_unit: number }[]

        for (const comp of components) {
          const needed = comp.qty_per_unit * (po.qty as number)
          db.prepare("UPDATE raw_materials SET reserved_stock = MAX(0, reserved_stock - ?) WHERE id=?")
            .run(needed, comp.material_id)
          db.prepare(`
            UPDATE inventory_reservations
            SET is_active=0, released_at=?
            WHERE reference_id=? AND entity_id=? AND is_active=1
          `).run(now, id, comp.material_id)
        }
      }

      // Apply scheduling fields if provided
      if (plannedStart) db.prepare("UPDATE production_orders SET planned_start=? WHERE id=?").run(plannedStart, id)
      if (plannedEnd)   db.prepare("UPDATE production_orders SET planned_end=? WHERE id=?").run(plannedEnd, id)
      if (workCenterId) db.prepare("UPDATE production_orders SET work_center_id=? WHERE id=?").run(workCenterId, id)

      db.prepare("UPDATE production_orders SET status=?, updated_at=?, updated_by=? WHERE id=?")
        .run(status, now, auth.id, id)

      writeAuditLog(db, {
        userId: auth.id,
        action: `PROD_STATUS_${status}`,
        entityType: "production_order",
        entityId: id,
        before: { status: current },
        after:  { status },
      })

      return { id, status, updatedAt: now }
    })()

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
