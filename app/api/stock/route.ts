import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, checkReplenishment } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { entityType, entityId, delta, reason } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: "reason is required for stock adjustments" }, { status: 400 })
  }
  if (delta === 0) {
    return NextResponse.json({ error: "delta cannot be zero" }, { status: 400 })
  }

  try {
    db.transaction(() => {
      if (entityType === "raw_material") {
        const rm = db.prepare("SELECT current_stock, name FROM raw_materials WHERE id=?").get(entityId) as
          { current_stock: number; name: string } | undefined
        if (!rm) throw new Error("Raw material not found")
        if (delta < 0 && rm.current_stock + delta < 0) {
          throw new Error(`Cannot adjust: only ${rm.current_stock} in stock, cannot remove ${Math.abs(delta)}`)
        }
        const before = { current_stock: rm.current_stock }
        db.prepare("UPDATE raw_materials SET current_stock = current_stock + ? WHERE id=?").run(delta, entityId)
        writeAuditLog(db, {
          userId: auth.id, action: "STOCK_ADJUSTED", entityType: "raw_material", entityId,
          before, after: { current_stock: rm.current_stock + delta }, details: reason,
        })
      } else {
        const prod = db.prepare("SELECT current_stock, name FROM products WHERE id=?").get(entityId) as
          { current_stock: number; name: string } | undefined
        if (!prod) throw new Error("Product not found")
        if (delta < 0 && prod.current_stock + delta < 0) {
          throw new Error(`Cannot adjust: only ${prod.current_stock} in stock, cannot remove ${Math.abs(delta)}`)
        }
        const before = { current_stock: prod.current_stock }
        db.prepare("UPDATE products SET current_stock = current_stock + ? WHERE id=?").run(delta, entityId)
        writeAuditLog(db, {
          userId: auth.id, action: "STOCK_ADJUSTED", entityType: "product", entityId,
          before, after: { current_stock: prod.current_stock + delta }, details: reason,
        })
      }

      db.prepare(`
        INSERT INTO stock_movements
          (entity_type, entity_id, delta, reason, reference_type, reference_id, created_by, created_at)
        VALUES (?, ?, ?, ?, 'manual_adjustment', ?, ?, ?)
      `).run(entityType, entityId, delta, reason, entityId, auth.id, now)

      // Check if adjustment brings any raw material below reorder point
      if (delta < 0 && entityType === "raw_material") checkReplenishment(db)
    })()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
