import type { getDb } from "@/lib/db"

type Db = ReturnType<typeof getDb>

const userNameStmt = (db: Db) =>
  db.prepare("SELECT id, name FROM users WHERE id = ?")

const userByNameStmt = (db: Db) =>
  db.prepare("SELECT id, name FROM users WHERE name = ?")

export function resolveSalesPerson(
  db: Db,
  createdBy: string | null | undefined
): { salesPersonId: string | null; salesPersonName: string } {
  if (!createdBy) {
    return { salesPersonId: null, salesPersonName: "—" }
  }

  if (createdBy.startsWith("usr-")) {
    const user = userNameStmt(db).get(createdBy) as { id: string; name: string } | undefined
    return {
      salesPersonId: createdBy,
      salesPersonName: user?.name ?? createdBy,
    }
  }

  const byName = userByNameStmt(db).get(createdBy) as { id: string; name: string } | undefined
  if (byName) {
    return { salesPersonId: byName.id, salesPersonName: byName.name }
  }

  return { salesPersonId: null, salesPersonName: createdBy }
}

export function enrichOrder(db: Db, r: Record<string, unknown>) {
  const lines = db
    .prepare(
      `SELECT sol.*, p.image_url
       FROM sales_order_lines sol
       LEFT JOIN products p ON p.id = sol.product_id
       WHERE sol.order_id = ?`
    )
    .all(r.id) as Record<string, unknown>[]

  const createdByRaw = r.created_by != null ? String(r.created_by) : ""
  const { salesPersonId, salesPersonName } = resolveSalesPerson(db, createdByRaw)

  return {
    id: r.id,
    orderNumber: r.order_number,
    customerId: r.customer_id,
    status: r.status,
    notes: r.notes,
    createdBy: salesPersonId ?? createdByRaw,
    salesPersonId,
    salesPersonName,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    requestedDeliveryDate: r.requested_delivery_date,
    promisedDeliveryDate: r.promised_delivery_date,
    actualDeliveryDate: r.actual_delivery_date,
    parentOrderId: r.parent_order_id,
    revisionNumber: r.revision_number ?? 1,
    approvalStatus: r.approval_status ?? "PENDING",
    creditCheckPassed: r.credit_check_passed === 1,
    tracking_number: r.tracking_number,
    carrier: r.carrier,
    lines: lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      qty: l.qty,
      unitPrice: l.unit_price,
      fulfilledQty: l.fulfilled_qty ?? 0,
      imageUrl: l.image_url,
    })),
  }
}
