import type {
  Customer,
  Product,
  RawMaterial,
  Supplier,
  User,
  BOM,
  SalesOrder,
  ProductionOrder,
  Shipment,
} from "@/lib/types"
import { hashPassword } from "@/lib/utils"

// Default password for all seeded users: Password@123
const DEFAULT_HASH = hashPassword("Password@123")

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers: Supplier[] = [
  { id: "sup-1", name: "TextileCo India", contact: "+91-9800001111", leadTimeDays: 7, paymentTerms: "Net 30" },
  { id: "sup-2", name: "FastenWorld", contact: "+91-9800002222", leadTimeDays: 5, paymentTerms: "Net 15" },
  { id: "sup-3", name: "ThreadMill Ltd", contact: "+91-9800003333", leadTimeDays: 4, paymentTerms: "Net 30" },
  { id: "sup-4", name: "LabelPrint Co", contact: "+91-9800004444", leadTimeDays: 3, paymentTerms: "Advance" },
]

// ─── Raw Materials ────────────────────────────────────────────────────────────
export const rawMaterials: RawMaterial[] = [
  { id: "rm-1", name: "Cotton Fabric (White)", unit: "metres", currentStock: 480, reservedStock: 0, reorderPoint: 200, supplierId: "sup-1" },
  { id: "rm-2", name: "Cotton Fabric (Blue Oxford)", unit: "metres", currentStock: 310, reservedStock: 0, reorderPoint: 150, supplierId: "sup-1" },
  { id: "rm-3", name: "Linen Fabric (Beige)", unit: "metres", currentStock: 95, reservedStock: 0, reorderPoint: 100, supplierId: "sup-1" },
  { id: "rm-4", name: "Buttons (White Pearl)", unit: "pcs", currentStock: 6400, reservedStock: 0, reorderPoint: 2000, supplierId: "sup-2" },
  { id: "rm-5", name: "Buttons (Brown Wood)", unit: "pcs", currentStock: 3200, reservedStock: 0, reorderPoint: 1500, supplierId: "sup-2" },
  { id: "rm-6", name: "Thread (White)", unit: "spools", currentStock: 280, reservedStock: 0, reorderPoint: 100, supplierId: "sup-3" },
  { id: "rm-7", name: "Thread (Blue)", unit: "spools", currentStock: 190, reservedStock: 0, reorderPoint: 80, supplierId: "sup-3" },
  { id: "rm-8", name: "Collar Lining", unit: "pcs", currentStock: 820, reservedStock: 0, reorderPoint: 300, supplierId: "sup-1" },
  { id: "rm-9", name: "Woven Labels", unit: "pcs", currentStock: 1500, reservedStock: 0, reorderPoint: 500, supplierId: "sup-4" },
  { id: "rm-10", name: "Poly Bags", unit: "pcs", currentStock: 1200, reservedStock: 0, reorderPoint: 400, supplierId: "sup-4" },
]

// ─── Products ─────────────────────────────────────────────────────────────────
export const products: Product[] = [
  { id: "prod-1", name: "Classic White Shirt", sku: "SHT-WHT-001", unitOfMeasure: "pcs", price: 899, bomId: "bom-1", currentStock: 120, reservedStock: 0 },
  { id: "prod-2", name: "Oxford Blue Shirt", sku: "SHT-BLU-002", unitOfMeasure: "pcs", price: 999, bomId: "bom-2", currentStock: 85, reservedStock: 0 },
  { id: "prod-3", name: "Linen Casual Shirt", sku: "SHT-LIN-003", unitOfMeasure: "pcs", price: 1199, bomId: "bom-3", currentStock: 40, reservedStock: 0 },
]

// ─── BOMs ─────────────────────────────────────────────────────────────────────
export const boms: BOM[] = [
  {
    id: "bom-1",
    productId: "prod-1",
    version: "v1.2",
    status: "ACTIVE",
    createdBy: "Priya Sharma",
    createdAt: "2026-01-10T09:00:00Z",
    components: [
      { materialId: "rm-1", qtyPerUnit: 2.2 },
      { materialId: "rm-4", qtyPerUnit: 8 },
      { materialId: "rm-6", qtyPerUnit: 2 },
      { materialId: "rm-8", qtyPerUnit: 1 },
      { materialId: "rm-9", qtyPerUnit: 1 },
      { materialId: "rm-10", qtyPerUnit: 1 },
    ],
  },
  {
    id: "bom-2",
    productId: "prod-2",
    version: "v1.0",
    status: "ACTIVE",
    createdBy: "Priya Sharma",
    createdAt: "2026-01-15T09:00:00Z",
    components: [
      { materialId: "rm-2", qtyPerUnit: 2.2 },
      { materialId: "rm-5", qtyPerUnit: 8 },
      { materialId: "rm-7", qtyPerUnit: 2 },
      { materialId: "rm-8", qtyPerUnit: 1 },
      { materialId: "rm-9", qtyPerUnit: 1 },
      { materialId: "rm-10", qtyPerUnit: 1 },
    ],
  },
  {
    id: "bom-3",
    productId: "prod-3",
    version: "v1.0",
    status: "DRAFT",
    createdBy: "Priya Sharma",
    createdAt: "2026-02-01T09:00:00Z",
    components: [
      { materialId: "rm-3", qtyPerUnit: 2.5 },
      { materialId: "rm-5", qtyPerUnit: 6 },
      { materialId: "rm-6", qtyPerUnit: 2 },
      { materialId: "rm-8", qtyPerUnit: 1 },
      { materialId: "rm-9", qtyPerUnit: 1 },
      { materialId: "rm-10", qtyPerUnit: 1 },
    ],
  },
]

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers: Customer[] = [
  { id: "cust-1", name: "Zara India Pvt Ltd", contact: "+91-9911001100", email: "orders@zara.in", address: "Linking Rd, Mumbai 400050", creditLimit: 1000000, paymentTerms: "Net 45" },
  { id: "cust-2", name: "H&M Retail India", contact: "+91-9922002200", email: "supply@hm.in", address: "MG Road, Bengaluru 560001", creditLimit: 750000, paymentTerms: "Net 30" },
  { id: "cust-3", name: "Marks & Spencer India", contact: "+91-9933003300", email: "procurement@mandsindia.com", address: "Khan Market, New Delhi 110003", creditLimit: 500000, paymentTerms: "Net 30" },
  { id: "cust-4", name: "FabIndia Ltd", contact: "+91-9944004400", email: "trade@fabindia.com", address: "Connaught Place, New Delhi 110001", creditLimit: 300000, paymentTerms: "Net 15" },
]

// ─── Sales Orders ─────────────────────────────────────────────────────────────
export const salesOrders: SalesOrder[] = [
  {
    id: "so-001",
    customerId: "cust-1",
    status: "DELIVERED",
    createdBy: "Rahul Verma",
    createdAt: "2026-05-02T10:00:00Z",
    updatedAt: "2026-05-18T14:00:00Z",
    lines: [{ productId: "prod-1", qty: 200, unitPrice: 899 }],
  },
  {
    id: "so-002",
    customerId: "cust-2",
    status: "SHIPPED",
    createdBy: "Rahul Verma",
    createdAt: "2026-05-10T11:00:00Z",
    updatedAt: "2026-05-25T09:00:00Z",
    lines: [{ productId: "prod-2", qty: 150, unitPrice: 999 }],
  },
  {
    id: "so-003",
    customerId: "cust-3",
    status: "IN_PRODUCTION",
    createdBy: "Anjali Singh",
    createdAt: "2026-05-20T08:30:00Z",
    updatedAt: "2026-05-28T10:00:00Z",
    lines: [
      { productId: "prod-1", qty: 100, unitPrice: 899 },
      { productId: "prod-2", qty: 80, unitPrice: 999 },
    ],
  },
  {
    id: "so-004",
    customerId: "cust-4",
    status: "APPROVED",
    createdBy: "Anjali Singh",
    createdAt: "2026-05-28T09:00:00Z",
    updatedAt: "2026-05-29T11:00:00Z",
    lines: [{ productId: "prod-3", qty: 60, unitPrice: 1199 }],
  },
  {
    id: "so-005",
    customerId: "cust-1",
    status: "SUBMITTED",
    createdBy: "Rahul Verma",
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    lines: [{ productId: "prod-2", qty: 250, unitPrice: 999 }],
  },
  {
    id: "so-006",
    customerId: "cust-2",
    status: "DRAFT",
    createdBy: "Anjali Singh",
    createdAt: "2026-06-02T14:00:00Z",
    updatedAt: "2026-06-02T14:00:00Z",
    lines: [{ productId: "prod-1", qty: 300, unitPrice: 849 }],
  },
]

// ─── Production Orders ────────────────────────────────────────────────────────
export const productionOrders: ProductionOrder[] = [
  {
    id: "po-001",
    salesOrderId: "so-003",
    productId: "prod-1",
    qty: 100,
    status: "IN_PROGRESS",
    bomId: "bom-1",
    createdAt: "2026-05-21T09:00:00Z",
    updatedAt: "2026-05-28T10:00:00Z",
  },
  {
    id: "po-002",
    salesOrderId: "so-003",
    productId: "prod-2",
    qty: 80,
    status: "MATERIAL_RESERVED",
    bomId: "bom-2",
    createdAt: "2026-05-21T09:15:00Z",
    updatedAt: "2026-05-27T11:00:00Z",
  },
  {
    id: "po-003",
    salesOrderId: "so-004",
    productId: "prod-3",
    qty: 60,
    status: "PLANNED",
    bomId: "bom-3",
    createdAt: "2026-05-29T10:00:00Z",
    updatedAt: "2026-05-29T10:00:00Z",
    notes: "Awaiting BOM activation",
  },
]

// ─── Shipments ────────────────────────────────────────────────────────────────
export const shipments: Shipment[] = [
  {
    id: "shp-001",
    salesOrderId: "so-001",
    status: "DELIVERED",
    trackingNumber: "DHLIND20260518",
    carrier: "DHL",
    createdAt: "2026-05-15T10:00:00Z",
    updatedAt: "2026-05-18T14:00:00Z",
  },
  {
    id: "shp-002",
    salesOrderId: "so-002",
    status: "IN_TRANSIT",
    trackingNumber: "FEDEX20260525",
    carrier: "FedEx",
    createdAt: "2026-05-23T09:00:00Z",
    updatedAt: "2026-05-25T09:00:00Z",
  },
]

// ─── Users ────────────────────────────────────────────────────────────────────
export const users: User[] = [
  { id: "usr-1", name: "Arjun Mehta",   email: "arjun@shirtco.in",  role: "Admin",            status: "Active",   lastLogin: "2026-06-03T08:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-2", name: "Rahul Verma",   email: "rahul@shirtco.in",  role: "Sales Executive",  status: "Active",   lastLogin: "2026-06-03T07:45:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-3", name: "Anjali Singh",  email: "anjali@shirtco.in", role: "Sales Executive",  status: "Active",   lastLogin: "2026-06-02T18:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-4", name: "Priya Sharma",  email: "priya@shirtco.in",  role: "Production Manager",status: "Active",  lastLogin: "2026-06-03T08:30:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-5", name: "Vikram Nair",   email: "vikram@shirtco.in", role: "Inventory Manager",status: "Active",   lastLogin: "2026-06-03T07:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-6", name: "Sneha Patel",   email: "sneha@shirtco.in",  role: "Viewer",           status: "Active",   lastLogin: "2026-06-01T16:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-7", name: "Karan Joshi",   email: "karan@shirtco.in",  role: "Inventory Manager",status: "Inactive", lastLogin: "2026-04-15T10:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-8", name: "Meera Iyer",    email: "meera@shirtco.in",  role: "Finance Manager",  status: "Active",   lastLogin: "2026-06-03T09:00:00Z", passwordHash: DEFAULT_HASH },
]
