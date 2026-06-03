import type { Database } from "better-sqlite3"

/**
 * Write an immutable audit log entry inside an existing transaction.
 * Pass `before` and `after` as plain objects — they will be JSON-serialised.
 * This function is intentionally synchronous (SQLite is synchronous) and must
 * be called inside a db.transaction() block so the log entry is atomic with
 * the change it records.
 */
export function writeAuditLog(
  db: Database,
  opts: {
    userId: string | null
    action: string
    entityType: string
    entityId: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    details?: string
    ipAddress?: string
  }
) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before_state, after_state, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    opts.userId ?? "system",
    opts.action,
    opts.entityType,
    opts.entityId,
    opts.before ? JSON.stringify(opts.before) : null,
    opts.after  ? JSON.stringify(opts.after)  : null,
    opts.details ?? null,
    opts.ipAddress ?? null
  )
}

/**
 * Insert an in-app notification.
 * Can be targeted to a specific user (userId) or all users with a given role.
 */
export function createNotification(
  db: Database,
  opts: {
    userId?: string | null
    role?: string | null
    type: string
    title: string
    message: string
    entityType?: string
    entityId?: string
  }
) {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  db.prepare(`
    INSERT INTO notifications (id, user_id, role, type, title, message, entity_type, entity_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
  `).run(
    id,
    opts.userId ?? null,
    opts.role   ?? null,
    opts.type,
    opts.title,
    opts.message,
    opts.entityType ?? null,
    opts.entityId   ?? null
  )
}

/**
 * Scan raw_materials and create replenishment suggestions for any items
 * below their reorder_point that don't already have an OPEN suggestion.
 */
export function checkReplenishment(db: Database) {
  const lowStock = db.prepare(`
    SELECT id, name, current_stock, reserved_stock, reorder_point, supplier_id
    FROM raw_materials
    WHERE is_active = 1
      AND (current_stock - COALESCE(reserved_stock,0)) < reorder_point
  `).all() as { id: string; name: string; current_stock: number; reserved_stock: number; reorder_point: number; supplier_id: string }[]

  for (const rm of lowStock) {
    const existing = db.prepare(
      "SELECT id FROM replenishment_suggestions WHERE material_id=? AND status='OPEN' LIMIT 1"
    ).get(rm.id)
    if (existing) continue

    const available = rm.current_stock - (rm.reserved_stock ?? 0)
    const suggestedQty = Math.max(rm.reorder_point * 2 - available, rm.reorder_point)
    const suggId = `repl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    db.prepare(`
      INSERT INTO replenishment_suggestions (id, material_id, current_stock, reorder_point, suggested_qty, supplier_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'OPEN', datetime('now'))
    `).run(suggId, rm.id, rm.current_stock, rm.reorder_point, suggestedQty, rm.supplier_id ?? null)

    createNotification(db, {
      role: "Inventory Manager",
      type: "LOW_STOCK",
      title: `Low Stock: ${rm.name}`,
      message: `${rm.name} is below reorder point. Available: ${available} ${""}, Reorder Point: ${rm.reorder_point}. Suggested order: ${suggestedQty}.`,
      entityType: "raw_material",
      entityId: rm.id,
    })
  }
}
