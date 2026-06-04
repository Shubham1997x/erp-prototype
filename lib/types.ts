// ─── Sales Order Status ───────────────────────────────────────────────────────

export type SalesOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "INVENTORY_CHECK"
  | "APPROVED"
  | "IN_PRODUCTION"
  | "READY_TO_SHIP"
  | "PARTIALLY_FULFILLED"
  | "SHIPPED"
  | "DELIVERED"
  | "INVOICED"
  | "PAID"
  | "DISPUTED"
  | "CREDIT_HOLD"
  | "CANCELLED"
  | "NEEDS_RESTOCK"

export const SO_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  DRAFT:                ["SUBMITTED", "CANCELLED"],
  SUBMITTED:            ["INVENTORY_CHECK", "APPROVED", "CREDIT_HOLD", "CANCELLED"],
  INVENTORY_CHECK:      ["APPROVED", "IN_PRODUCTION", "CREDIT_HOLD", "CANCELLED", "NEEDS_RESTOCK"],
  CREDIT_HOLD:          ["APPROVED", "CANCELLED"],
  APPROVED:             ["IN_PRODUCTION", "READY_TO_SHIP", "CANCELLED", "NEEDS_RESTOCK", "DELIVERED"],
  IN_PRODUCTION:        ["READY_TO_SHIP", "PARTIALLY_FULFILLED", "CANCELLED", "NEEDS_RESTOCK"],
  NEEDS_RESTOCK:        ["DELIVERED", "CANCELLED"],
  READY_TO_SHIP:        ["SHIPPED", "CANCELLED"],
  PARTIALLY_FULFILLED:  ["READY_TO_SHIP", "SHIPPED", "CANCELLED"],
  SHIPPED:              ["DELIVERED", "CANCELLED"],
  DELIVERED:            ["INVOICED"],
  INVOICED:             ["PAID", "DISPUTED"],
  PAID:                 [],
  DISPUTED:             ["INVOICED", "PAID"],
  CANCELLED:            [],
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED"

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserRole =
  | "Admin"
  | "Sales Executive"
  | "Inventory Manager"

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: "Active" | "Inactive"
  lastLogin: string
  passwordHash?: string
}

// ─── Master Data ──────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  name: string
  contact: string
  email: string
  address: string
  creditLimit: number
  paymentTerms: string
  isActive?: boolean
  deletedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Product {
  id: string
  name: string
  sku: string
  unitOfMeasure: string
  price: number
  bomId: string | null
  currentStock: number
  reservedStock: number
  unitCost?: number
  standardCost?: number
  category?: string | null
  isActive?: boolean
}

// ─── Sales Orders ─────────────────────────────────────────────────────────────

export interface SalesOrderLine {
  id?: number
  productId: string
  qty: number
  unitPrice: number
  fulfilledQty?: number
}

export interface SalesOrder {
  id: string
  customerId: string
  status: SalesOrderStatus
  lines: SalesOrderLine[]
  createdBy: string
  updatedBy?: string
  createdAt: string
  updatedAt: string
  notes?: string
  requestedDeliveryDate?: string | null
  promisedDeliveryDate?: string | null
  actualDeliveryDate?: string | null
  parentOrderId?: string | null
  revisionNumber?: number
  creditCheckPassed?: boolean
  approvalStatus?: ApprovalStatus
  tracking_number?: string | null
  carrier?: string | null
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface StockMovement {
  id: string
  entityType: "raw_material" | "product"
  entityId: string
  delta: number
  reason: string
  referenceType?: string | null
  referenceId?: string | null
  createdAt: string
  createdBy: string
}
