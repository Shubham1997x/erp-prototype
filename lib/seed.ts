import type { Customer, Product, SalesOrder, User } from "@/lib/types"
import { hashPassword } from "@/lib/core"

const DEFAULT_HASH = hashPassword("Password@123")

// ─── Products ─────────────────────────────────────────────────────────────────
export const products: Product[] = [
  { id: "prod-1", name: "Classic White Shirt", sku: "SHT-WHT-001", unitOfMeasure: "pcs", price: 899, bomId: null, currentStock: 120, reservedStock: 0 },
  { id: "prod-2", name: "Oxford Blue Shirt",   sku: "SHT-BLU-002", unitOfMeasure: "pcs", price: 999, bomId: null, currentStock: 85,  reservedStock: 0 },
  { id: "prod-3", name: "Linen Casual Shirt",  sku: "SHT-LIN-003", unitOfMeasure: "pcs", price: 1199, bomId: null, currentStock: 40, reservedStock: 0 },
]

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers: Customer[] = [
  { id: "cust-1", name: "Zara India Pvt Ltd",    contact: "+91-9911001100", email: "orders@zara.in",          address: "Linking Rd, Mumbai 400050",       creditLimit: 1000000, paymentTerms: "Net 45" },
  { id: "cust-2", name: "H&M Retail India",       contact: "+91-9922002200", email: "supply@hm.in",            address: "MG Road, Bengaluru 560001",        creditLimit: 750000,  paymentTerms: "Net 30" },
  { id: "cust-3", name: "Marks & Spencer India",  contact: "+91-9933003300", email: "procurement@mandsindia.com", address: "Khan Market, New Delhi 110003", creditLimit: 500000,  paymentTerms: "Net 30" },
  { id: "cust-4", name: "FabIndia Ltd",           contact: "+91-9944004400", email: "trade@fabindia.com",       address: "Connaught Place, New Delhi 110001", creditLimit: 300000, paymentTerms: "Net 15" },
]

// ─── Sales Orders ─────────────────────────────────────────────────────────────
export const salesOrders: SalesOrder[] = [
  {
    id: "so-001",
    customerId: "cust-1",
    status: "DELIVERED",
    createdBy: "usr-2",
    createdAt: "2026-05-02T10:00:00Z",
    updatedAt: "2026-05-18T14:00:00Z",
    lines: [{ productId: "prod-1", qty: 200, unitPrice: 899 }],
  },
  {
    id: "so-002",
    customerId: "cust-2",
    status: "SHIPPED",
    createdBy: "usr-2",
    createdAt: "2026-05-10T11:00:00Z",
    updatedAt: "2026-05-25T09:00:00Z",
    lines: [{ productId: "prod-2", qty: 150, unitPrice: 999 }],
  },
  {
    id: "so-003",
    customerId: "cust-3",
    status: "IN_PRODUCTION",
    createdBy: "usr-3",
    createdAt: "2026-05-20T08:30:00Z",
    updatedAt: "2026-05-28T10:00:00Z",
    lines: [
      { productId: "prod-1", qty: 100, unitPrice: 899 },
      { productId: "prod-2", qty: 80,  unitPrice: 999 },
    ],
  },
  {
    id: "so-004",
    customerId: "cust-4",
    status: "APPROVED",
    createdBy: "usr-3",
    createdAt: "2026-05-28T09:00:00Z",
    updatedAt: "2026-05-29T11:00:00Z",
    lines: [{ productId: "prod-3", qty: 60, unitPrice: 1199 }],
  },
  {
    id: "so-005",
    customerId: "cust-1",
    status: "SUBMITTED",
    createdBy: "usr-2",
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    lines: [{ productId: "prod-2", qty: 250, unitPrice: 999 }],
  },
  {
    id: "so-006",
    customerId: "cust-2",
    status: "DRAFT",
    createdBy: "usr-3",
    createdAt: "2026-06-02T14:00:00Z",
    updatedAt: "2026-06-02T14:00:00Z",
    lines: [{ productId: "prod-1", qty: 300, unitPrice: 849 }],
  },
]

// ─── Users ────────────────────────────────────────────────────────────────────
export const users: User[] = [
  { id: "usr-1", name: "Arjun Mehta",  email: "arjun@shirtco.in",  role: "Admin",            status: "Active",   lastLogin: "2026-06-03T08:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-2", name: "Rahul Verma",  email: "rahul@shirtco.in",  role: "Sales Executive",  status: "Active",   lastLogin: "2026-06-03T07:45:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-3", name: "Anjali Singh", email: "anjali@shirtco.in", role: "Sales Executive",  status: "Active",   lastLogin: "2026-06-02T18:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-5", name: "Vikram Nair",  email: "vikram@shirtco.in", role: "Inventory Manager",status: "Active",   lastLogin: "2026-06-03T07:00:00Z", passwordHash: DEFAULT_HASH },
  { id: "usr-7", name: "Karan Joshi",  email: "karan@shirtco.in",  role: "Inventory Manager",status: "Inactive", lastLogin: "2026-04-15T10:00:00Z", passwordHash: DEFAULT_HASH },
]
