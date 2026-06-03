// ─── Enums ────────────────────────────────────────────────────────────────────

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

export type BOMStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | "UNDER_REVIEW"

export type ProductionStatus =
  | "PLANNED"
  | "RELEASED"
  | "AWAITING_MATERIALS"
  | "MATERIAL_RESERVED"
  | "IN_PROGRESS"
  | "QUALITY_CHECK"
  | "PARTIALLY_COMPLETED"
  | "COMPLETED"
  | "ON_HOLD"
  | "CANCELLED"
  | "REJECTED"

export type ShipmentStatus =
  | "READY_TO_SHIP"
  | "PACKING"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "RETURNED"
  | "LOST"
  | "DAMAGED"
  | "CANCELLED"

export type UserRole =
  | "Admin"
  | "Sales Executive"
  | "Production Manager"
  | "Inventory Manager"
  | "Finance Manager"
  | "Viewer"

export type PurchaseOrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "ISSUED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "INVOICED"
  | "PAID"
  | "CANCELLED"

export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "DISPUTED" | "VOID"

export type ReturnOrderStatus =
  | "REQUESTED"
  | "APPROVED"
  | "GOODS_RECEIVED"
  | "QC_INSPECTION"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED"

export type QualityInspectionStatus = "PENDING" | "PASSED" | "PARTIALLY_PASSED" | "FAILED"

export type ReworkStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SCRAPPED"

export type CycleCountStatus = "DRAFT" | "IN_PROGRESS" | "PENDING_APPROVAL" | "COMPLETED"

// ─── Allowed Status Transition Matrices ───────────────────────────────────────

export const SO_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  DRAFT:                ["SUBMITTED", "CANCELLED"],
  SUBMITTED:            ["INVENTORY_CHECK", "APPROVED", "CREDIT_HOLD", "CANCELLED"],
  INVENTORY_CHECK:      ["APPROVED", "IN_PRODUCTION", "CREDIT_HOLD", "CANCELLED"],
  CREDIT_HOLD:          ["APPROVED", "CANCELLED"],
  APPROVED:             ["IN_PRODUCTION", "READY_TO_SHIP", "CANCELLED"],
  IN_PRODUCTION:        ["READY_TO_SHIP", "PARTIALLY_FULFILLED", "CANCELLED"],
  READY_TO_SHIP:        ["SHIPPED", "CANCELLED"],
  PARTIALLY_FULFILLED:  ["READY_TO_SHIP", "SHIPPED", "CANCELLED"],
  SHIPPED:              ["DELIVERED", "CANCELLED"],
  DELIVERED:            ["INVOICED"],
  INVOICED:             ["PAID", "DISPUTED"],
  PAID:                 [],
  DISPUTED:             ["INVOICED", "PAID"],
  CANCELLED:            [],
}

export const PROD_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  PLANNED:              ["RELEASED", "CANCELLED"],
  RELEASED:             ["AWAITING_MATERIALS", "MATERIAL_RESERVED", "CANCELLED"],
  AWAITING_MATERIALS:   ["MATERIAL_RESERVED", "CANCELLED"],
  MATERIAL_RESERVED:    ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
  IN_PROGRESS:          ["QUALITY_CHECK", "ON_HOLD", "PARTIALLY_COMPLETED"],
  QUALITY_CHECK:        ["COMPLETED", "REJECTED", "IN_PROGRESS"],
  PARTIALLY_COMPLETED:  ["IN_PROGRESS", "COMPLETED"],
  ON_HOLD:              ["RELEASED", "CANCELLED"],
  COMPLETED:            [],
  REJECTED:             ["IN_PROGRESS", "CANCELLED"],
  CANCELLED:            [],
}

export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  READY_TO_SHIP: ["PACKING", "DISPATCHED", "CANCELLED"],
  PACKING:       ["DISPATCHED", "CANCELLED"],
  DISPATCHED:    ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT:    ["DELIVERED", "RETURNED", "LOST", "DAMAGED"],
  DELIVERED:     [],
  RETURNED:      [],
  LOST:          [],
  DAMAGED:       [],
  CANCELLED:     [],
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

export interface RawMaterial {
  id: string
  name: string
  unit: string
  currentStock: number
  reservedStock: number
  reorderPoint: number
  supplierId: string
  unitCost?: number
  isActive?: boolean
}

export interface Supplier {
  id: string
  name: string
  contact: string
  leadTimeDays: number
  paymentTerms: string
  onTimeDeliveryRate?: number
  qualityRating?: number
  isActive?: boolean
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: "Active" | "Inactive"
  lastLogin: string
  passwordHash?: string
}

export interface WorkCenter {
  id: string
  name: string
  capacityPerDay: number
  unit: string
  isActive: boolean
  createdAt: string
}

export interface Warehouse {
  id: string
  name: string
  address?: string
  isActive: boolean
  createdAt: string
}

export interface WarehouseLocation {
  id: string
  warehouseId: string
  name: string
  type: "RECEIVING" | "STORAGE" | "WIP" | "DISPATCH"
  isActive: boolean
}

export interface TaxRate {
  id: string
  name: string
  rate: number
  appliesTo: string
  isActive: boolean
}

export interface UnitConversion {
  id: number
  fromUnit: string
  toUnit: string
  factor: number
}

// ─── BOM ──────────────────────────────────────────────────────────────────────

export interface BOMComponent {
  materialId: string
  qtyPerUnit: number
}

export interface BOM {
  id: string
  productId: string
  version: string
  status: BOMStatus
  components: BOMComponent[]
  createdBy: string
  createdAt: string
  updatedBy?: string
  updatedAt?: string
  parentBomId?: string | null
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
}

// ─── Production Orders ────────────────────────────────────────────────────────

export interface ProductionOrder {
  id: string
  salesOrderId: string | null
  productId: string
  qty: number
  status: ProductionStatus
  bomId: string
  createdAt: string
  updatedAt: string
  updatedBy?: string
  notes?: string
  plannedStart?: string | null
  plannedEnd?: string | null
  actualStart?: string | null
  actualEnd?: string | null
  workCenterId?: string | null
  producedQty?: number
  scrappedQty?: number
}

// ─── Quality ──────────────────────────────────────────────────────────────────

export interface QualityInspection {
  id: string
  productionOrderId: string
  inspectorId?: string | null
  inspectedAt?: string | null
  producedQty: number
  passedQty: number
  rejectedQty: number
  defectCodes?: string | null
  notes?: string | null
  status: QualityInspectionStatus
  createdBy: string
  createdAt: string
}

export interface ScrapOrder {
  id: string
  productionOrderId?: string | null
  qualityInspectionId?: string | null
  productId?: string | null
  qtyScrapped: number
  scrapReason: string
  materialCostWrittenOff: number
  disposedBy?: string | null
  disposedAt?: string | null
  createdBy: string
  createdAt: string
}

export interface ReworkOrder {
  id: string
  originalProductionOrderId?: string | null
  qualityInspectionId?: string | null
  productId: string
  qty: number
  status: ReworkStatus
  reworkReason?: string | null
  workCenterId?: string | null
  plannedStart?: string | null
  plannedEnd?: string | null
  completedAt?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Shipments ────────────────────────────────────────────────────────────────

export interface Shipment {
  id: string
  salesOrderId: string
  status: ShipmentStatus
  trackingNumber?: string
  carrier?: string
  createdAt: string
  updatedAt: string
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

export interface InventoryReservation {
  id: string
  entityType: "raw_material" | "product"
  entityId: string
  reservedQty: number
  reservationType: "sales_order" | "production_order"
  referenceId: string
  referenceType: string
  createdBy?: string
  createdAt: string
  releasedAt?: string | null
  isActive: boolean
}

// ─── Procurement ──────────────────────────────────────────────────────────────

export interface PurchaseOrderLine {
  id?: number
  materialId: string
  qty: number
  unitPrice: number
  receivedQty: number
}

export interface PurchaseOrder {
  id: string
  supplierId: string
  status: PurchaseOrderStatus
  lines: PurchaseOrderLine[]
  createdBy: string
  updatedBy?: string
  approvedBy?: string | null
  approvedAt?: string | null
  createdAt: string
  updatedAt: string
  expectedDate?: string
  notes?: string
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  id?: number
  productId?: string | null
  description?: string
  qty: number
  unitPrice: number
  taxRate: number
  lineTotal: number
}

export interface Invoice {
  id: string
  salesOrderId?: string | null
  shipmentId?: string | null
  customerId: string
  status: InvoiceStatus
  issueDate?: string | null
  dueDate?: string | null
  subtotal: number
  taxAmount: number
  total: number
  paidAmount: number
  lines: InvoiceLine[]
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Payment {
  id: string
  invoiceId: string
  customerId: string
  amount: number
  paymentDate: string
  method: string
  reference?: string | null
  notes?: string | null
  createdBy: string
  createdAt: string
}

export interface SupplierInvoice {
  id: string
  purchaseOrderId?: string | null
  supplierId: string
  status: "RECEIVED" | "APPROVED" | "PAID" | "DISPUTED"
  invoiceNumber?: string | null
  invoiceDate?: string | null
  dueDate?: string | null
  subtotal: number
  taxAmount: number
  total: number
  paidAmount: number
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface SupplierPayment {
  id: string
  supplierInvoiceId: string
  supplierId: string
  amount: number
  paymentDate: string
  method: string
  reference?: string | null
  notes?: string | null
  createdBy: string
  createdAt: string
}

// ─── Returns (RMA) ────────────────────────────────────────────────────────────

export interface ReturnOrderLine {
  id?: number
  productId: string
  qty: number
  receivedQty: number
  condition: "NEW" | "GOOD" | "DAMAGED" | "UNKNOWN"
  disposition: "PENDING" | "RESTOCK" | "SCRAP" | "REWORK"
}

export interface ReturnOrder {
  id: string
  salesOrderId?: string | null
  shipmentId?: string | null
  customerId: string
  status: ReturnOrderStatus
  returnReason?: string | null
  returnType: "CUSTOMER_RETURN" | "DELIVERY_REJECTION" | "QUALITY_ISSUE"
  lines: ReturnOrderLine[]
  notes?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ─── Approvals ────────────────────────────────────────────────────────────────

export interface Approval {
  id: string
  entityType: string
  entityId: string
  requestedBy: string
  requiredRole: UserRole
  status: ApprovalStatus
  approvedBy?: string | null
  approvedAt?: string | null
  rejectedBy?: string | null
  rejectedAt?: string | null
  rejectionReason?: string | null
  notes?: string | null
  createdAt: string
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  userId?: string | null
  role?: string | null
  type: string
  title: string
  message: string
  entityType?: string | null
  entityId?: string | null
  isRead: boolean
  createdAt: string
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PriceListLine {
  id?: number
  productId: string
  unitPrice: number
  minQty: number
}

export interface PriceList {
  id: string
  name: string
  customerId?: string | null
  validFrom?: string | null
  validTo?: string | null
  isActive: boolean
  lines: PriceListLine[]
  createdBy: string
  createdAt: string
}

// ─── Cycle Count ─────────────────────────────────────────────────────────────

export interface CycleCountLine {
  id?: number
  entityId: string
  systemQty: number
  countedQty?: number | null
  variance?: number | null
  countedBy?: string | null
  countedAt?: string | null
}

export interface CycleCount {
  id: string
  name?: string | null
  status: CycleCountStatus
  entityType: "raw_material" | "product"
  lines: CycleCountLine[]
  createdBy: string
  createdAt: string
  completedAt?: string | null
  notes?: string | null
}

// ─── Replenishment ────────────────────────────────────────────────────────────

export interface ReplenishmentSuggestion {
  id: string
  materialId: string
  currentStock: number
  reorderPoint: number
  suggestedQty: number
  supplierId?: string | null
  status: "OPEN" | "ACTIONED" | "DISMISSED"
  createdAt: string
  actionedAt?: string | null
  actionedBy?: string | null
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────

export interface StockTransfer {
  id: string
  fromLocationId?: string | null
  toLocationId?: string | null
  entityType: "raw_material" | "product"
  entityId: string
  qty: number
  status: "DRAFT" | "IN_TRANSIT" | "COMPLETED" | "CANCELLED"
  notes?: string | null
  createdBy: string
  createdAt: string
  completedAt?: string | null
}
