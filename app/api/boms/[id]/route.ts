import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function enrichBom(db: ReturnType<typeof getDb>, id: string) {
  const r = db.prepare("SELECT * FROM boms WHERE id=?").get(id) as Record<string, unknown>
  const comps = db.prepare("SELECT * FROM bom_components WHERE bom_id=?").all(id) as Record<string, unknown>[]
  return {
    id: r.id, productId: r.product_id, version: r.version, status: r.status,
    createdBy: r.created_by, createdAt: r.created_at, updatedBy: r.updated_by,
    parentBomId: r.parent_bom_id,
    components: comps.map(c => ({ materialId: c.material_id, qtyPerUnit: c.qty_per_unit })),
  }
}

/**
 * PATCH /api/boms/[id]
 *
 * For DRAFT BOMs: update components and version in-place.
 * For ACTIVE BOMs: creating a new BOM version is required — this endpoint
 *   archives the current BOM and returns the new draft version.
 * For ARCHIVED BOMs: read-only, reject.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/boms/[id]">) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { components, version, createNewVersion } = await req.json()
  const db  = getDb()
  const now = new Date().toISOString()

  const existing = db.prepare("SELECT * FROM boms WHERE id=?").get(id) as Record<string, unknown> | undefined
  if (!existing) return NextResponse.json({ error: "BOM not found" }, { status: 404 })

  if (existing.status === "ARCHIVED") {
    return NextResponse.json({ error: "Archived BOMs cannot be modified. Create a new version." }, { status: 400 })
  }

  if (existing.status === "ACTIVE" && !createNewVersion) {
    return NextResponse.json({
      error: "Active BOMs cannot be edited in-place. Pass createNewVersion: true to create a new version, which will archive this BOM.",
    }, { status: 400 })
  }

  if (existing.status === "ACTIVE" && createNewVersion) {
    // Archive the current BOM and create a new DRAFT version
    const newBomId = newId("bom")
    const nextVersion = bumpVersion(existing.version as string)

    db.transaction(() => {
      // Archive current
      db.prepare("UPDATE boms SET status='ARCHIVED', updated_by=?, updated_at=? WHERE id=?")
        .run(auth.id, now, id)

      // Create new draft version with same product, pointing to old as parent
      db.prepare(`
        INSERT INTO boms (id, product_id, version, status, created_by, created_at, parent_bom_id)
        VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)
      `).run(newBomId, existing.product_id, nextVersion, auth.id, now, id)

      // Copy components (with any overrides from request)
      const sourceComponents = components ?? db.prepare("SELECT material_id, qty_per_unit FROM bom_components WHERE bom_id=?").all(id)
      for (const comp of sourceComponents) {
        db.prepare("INSERT INTO bom_components (bom_id, material_id, qty_per_unit) VALUES (?,?,?)")
          .run(newBomId, comp.materialId ?? comp.material_id, comp.qtyPerUnit ?? comp.qty_per_unit)
      }

      // Update product to point to new BOM
      db.prepare("UPDATE products SET bom_id=? WHERE bom_id=?").run(newBomId, id)

      writeAuditLog(db, {
        userId: auth.id, action: "BOM_NEW_VERSION",
        entityType: "bom", entityId: newBomId,
        details: `New version ${nextVersion} created from ${id}. Old BOM archived.`,
      })
    })()

    return NextResponse.json({ ...enrichBom(db, newBomId), _message: `New version ${nextVersion} created. Previous BOM archived.` })
  }

  // DRAFT — update in-place
  db.transaction(() => {
    if (version) {
      db.prepare("UPDATE boms SET version=?, updated_by=?, updated_at=? WHERE id=?").run(version, auth.id, now, id)
    } else {
      db.prepare("UPDATE boms SET updated_by=?, updated_at=? WHERE id=?").run(auth.id, now, id)
    }

    if (components) {
      db.prepare("DELETE FROM bom_components WHERE bom_id=?").run(id)
      for (const comp of components) {
        db.prepare("INSERT INTO bom_components (bom_id, material_id, qty_per_unit) VALUES (?,?,?)")
          .run(id, comp.materialId, comp.qtyPerUnit)
      }
    }

    writeAuditLog(db, {
      userId: auth.id, action: "BOM_UPDATED",
      entityType: "bom", entityId: id,
      details: `Draft BOM updated`,
    })
  })()

  return NextResponse.json(enrichBom(db, id))
}

function bumpVersion(version: string): string {
  const match = version.match(/^v?(\d+)\.(\d+)$/)
  if (!match) return `${version}.1`
  return `v${match[1]}.${parseInt(match[2]) + 1}`
}
