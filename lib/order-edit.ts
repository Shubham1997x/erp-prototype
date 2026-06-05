import type { SalesOrderStatus } from "@/lib/types"

/** Orders in these statuses can still be edited (lines, notes) by sales/admin. */
export const EDITABLE_ORDER_STATUSES: SalesOrderStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "CREDIT_HOLD",
  "INVENTORY_CHECK",
  "APPROVED",
  "NEEDS_RESTOCK",
  "READY_TO_SHIP",
]

export function canEditOrder(status: SalesOrderStatus): boolean {
  return EDITABLE_ORDER_STATUSES.includes(status)
}
