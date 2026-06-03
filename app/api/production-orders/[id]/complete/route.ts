import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification, checkReplenishment } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

/**
 * POST /api/production-orders/[id]/complete
 *
 * Body: { producedQty: number, scrappedQty?: number }
 *
 * Requires a PASSED/PARTIALLY_PASSED quality inspection record for this PO.
 * Deducts raw materials, adds finished goods, records scrap if any,
 * and auto-advances the linked sales order if all POs are complete.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/production-orders/[id]/complete">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const body   = await req.json().catch(() => ({}))
  const db     = getDb()
  const now    = new Date().toISOString()

  const po = db.prepare("SELECT * FROM production_orders WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!po) return NextResponse.json({ error: "Production order not found" }, { status: 404 })

  if (po.status !== "QUALITY_CHECK") {
    return NextResponse.json({ error: "Order must be in QUALITY_CHECK status before completing" }, { status: 400 })
  }

  // Require a completed quality inspection
  const qcRecord = db.prepare(`
    SELECT * FROM quality_inspections
    WHERE production_order_id=? AND status IN ('PASSED','PARTIALLY_PASSED')
    ORDER BY created_at DESC LIMIT 1
  `).get(id) as Record<string, unknown> | undefined

  if (!qcRecord) {
    return NextResponse.json({
      error: "A PASSED or PARTIALLY_PASSED quality inspection is required before completing production. Create a quality inspection first.",
    }, { status: 400 })
  }

  const passedQty   = (body.producedQty  ?? qcRecord.passed_qty)   as number
  const scrappedQty = (body.scrappedQty  ?? qcRecord.rejected_qty)  as number
  const totalQty    = po.qty as number

  if (passedQty <= 0) {
    return NextResponse.json({ error: "producedQty must be greater than 0" }, { status: 400 })
  }

  const components = db.prepare("SELECT * FROM bom_components WHERE bom_id=?")
    .all(po.bom_id as string) as { material_id: string; qty_per_unit: number }[]

  try {
    db.transaction(() => {
      const bom = db.prepare("SELECT status FROM boms WHERE id=?").get(po.bom_id as string) as { status: string } | undefined
      if (!bom) throw new Error("BOM not found")
      if (bom.status !== "ACTIVE") throw new Error(`BOM must be ACTIVE (currently ${bom.status})`)

      // Deduct raw materials based on total qty (produced + scrapped)
      for (const comp of components) {
        const consumed = comp.qty_per_unit * totalQty
        const rm = db.prepare("SELECT current_stock, name FROM raw_materials WHERE id=?")
          .get(comp.material_id) as { current_stock: number; name: string } | undefined

        if (!rm || rm.current_stock < consumed) {
          throw new Error(
            `Insufficient stock for "${rm?.name ?? comp.material_id}". Required: ${consumed}, Available: ${rm?.current_stock ?? 0}`
          )
        }

        db.prepare("UPDATE raw_materials SET current_stock = current_stock - ?, reserved_stock = MAX(0, reserved_stock - ?) WHERE id=?")
          .run(consumed, consumed, comp.material_id)

        // Release raw material reservation for this PO
        db.prepare("UPDATE inventory_reservations SET is_active=0, released_at=? WHERE reference_id=? AND entity_id=? AND is_active=1")
          .run(now, id, comp.material_id)

        db.prepare(`
          INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
          VALUES ('raw_material', ?, ?, ?, 'production_order', ?, ?, ?)
        `).run(comp.material_id, -consumed, `Production Order ${id} — Material Consumption`, id, auth.id, now)
      }

      // Add passed finished goods
      db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?")
        .run(passedQty, po.product_id)

      db.prepare(`
        INSERT INTO stock_movements (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
        VALUES ('product', ?, ?, ?, 'production_order', ?, ?, ?)
      `).run(po.product_id, passedQty, `Production Order ${id} — Finished Goods Receipt`, id, auth.id, now)

      // Record scrap if any
      if (scrappedQty > 0) {
        const scrapCost = components.reduce((sum, comp) => {
          const rm = db.prepare("SELECT unit_cost FROM raw_materials WHERE id=?").get(comp.material_id) as { unit_cost: number } | null
          return sum + comp.qty_per_unit * scrappedQty * (rm?.unit_cost ?? 0)
        }, 0)

        const scrapId = newId("scrap")
        db.prepare(`
          INSERT INTO scrap_orders (id, production_order_id, quality_inspection_id, product_id, qty_scrapped, scrap_reason, material_cost_written_off, disposed_by, disposed_at, created_by, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)
        `).run(scrapId, id, qcRecord.id, po.product_id, scrappedQty, "QC Rejection", scrapCost, auth.id, now, auth.id, now)
      }

      // Mark production order completed
      db.prepare(`
        UPDATE production_orders
        SET status='COMPLETED', actual_end=?, updated_at=?, updated_by=?, produced_qty=?, scrapped_qty=?
        WHERE id=?
      `).run(now, now, auth.id, passedQty, scrappedQty, id)

      // Auto-advance sales order to READY_TO_SHIP if all POs complete
      if (po.sales_order_id) {
        const incomplete = db.prepare(`
          SELECT COUNT(*) as count FROM production_orders
          WHERE sales_order_id=? AND status NOT IN ('COMPLETED','CANCELLED')
        `).get(po.sales_order_id) as { count: number }

        if (incomplete.count === 0) {
          db.prepare("UPDATE sales_orders SET status='READY_TO_SHIP', updated_at=?, updated_by=? WHERE id=?")
            .run(now, auth.id, po.sales_order_id)

          createNotification(db, {
            role: "Inventory Manager",
            type: "READY_TO_SHIP",
            title: `Sales Order ${po.sales_order_id} ready to ship`,
            message: `All production orders for SO ${po.sales_order_id} are complete.`,
            entityType: "sales_order",
            entityId: po.sales_order_id as string,
          })
        }
      }

      writeAuditLog(db, {
        userId: auth.id, action: "PROD_COMPLETED",
        entityType: "production_order", entityId: id,
        after: { producedQty: passedQty, scrappedQty, status: "COMPLETED" },
      })

      checkReplenishment(db)
    })()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  return NextResponse.json({ id, status: "COMPLETED", producedQty: passedQty, scrappedQty })
}
