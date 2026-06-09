import type { Customer, Product, SalesOrder, User } from "@/lib/types"
import { hashPassword } from "@/lib/core"

const DEFAULT_HASH = hashPassword("Password@123")

// ─── Products ─────────────────────────────────────────────────────────────────
export const products: Product[] = [
  { id: "prod-1", name: "Classic White Shirt",  sku: "SHT-WHT-001", unitOfMeasure: "pcs", price: 899,  bomId: null, currentStock: 120, reservedStock: 0, imageUrl: "/defaults/tshirt-1.jpg" },
  { id: "prod-2", name: "Oxford Blue Shirt",    sku: "SHT-BLU-002", unitOfMeasure: "pcs", price: 999,  bomId: null, currentStock: 85,  reservedStock: 0, imageUrl: "/defaults/tshirt-2.jpg" },
  { id: "prod-3", name: "Linen Casual Shirt",   sku: "SHT-LIN-003", unitOfMeasure: "pcs", price: 1199, bomId: null, currentStock: 40,  reservedStock: 0, imageUrl: "/defaults/tshirt-3.jpg" },
  { id: "prod-4",  name: "Cotton Kurta",              sku: "KRT-CTN-004", unitOfMeasure: "pcs", price: 799,  bomId: null, currentStock: 65,  reservedStock: 0, imageUrl: "/defaults/tshirt-4.jpg" },
  { id: "prod-5",  name: "Denim Casual Shirt",        sku: "SHT-DEN-005", unitOfMeasure: "pcs", price: 1349, bomId: null, currentStock: 55,  reservedStock: 0, imageUrl: "/defaults/tshirt-5.jpg" },
  { id: "prod-6",  name: "Formal White Shirt",        sku: "SHT-FML-006", unitOfMeasure: "pcs", price: 1099, bomId: null, currentStock: 70,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop" },
  { id: "prod-7",  name: "Striped Business Shirt",    sku: "SHT-STR-007", unitOfMeasure: "pcs", price: 1249, bomId: null, currentStock: 45,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop" },
  { id: "prod-8",  name: "Check Print Shirt",         sku: "SHT-CHK-008", unitOfMeasure: "pcs", price: 949,  bomId: null, currentStock: 60,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&auto=format&fit=crop" },
  { id: "prod-9",  name: "Slim Fit Black Shirt",      sku: "SHT-BLK-009", unitOfMeasure: "pcs", price: 1099, bomId: null, currentStock: 55,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=600&auto=format&fit=crop" },
  { id: "prod-10", name: "Printed Casual Shirt",      sku: "SHT-PRT-010", unitOfMeasure: "pcs", price: 899,  bomId: null, currentStock: 80,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1618517351616-38fb9c5210c6?w=600&auto=format&fit=crop" },
  { id: "prod-11", name: "Mandarin Collar Kurta",     sku: "KRT-MND-011", unitOfMeasure: "pcs", price: 1299, bomId: null, currentStock: 40,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1603252109303-2751441dd157?w=600&auto=format&fit=crop" },
  { id: "prod-12", name: "Embroidered Festive Kurta", sku: "KRT-EMB-012", unitOfMeasure: "pcs", price: 1799, bomId: null, currentStock: 30,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1614944848172-4e0d0e8b4e25?w=600&auto=format&fit=crop" },
  { id: "prod-13", name: "Pathani Suit",              sku: "PTH-CTN-013", unitOfMeasure: "pcs", price: 1599, bomId: null, currentStock: 25,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1625910513956-7a2f3e6e48a7?w=600&auto=format&fit=crop" },
  { id: "prod-14", name: "Nehru Jacket",              sku: "NHR-WOL-014", unitOfMeasure: "pcs", price: 2199, bomId: null, currentStock: 20,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=600&auto=format&fit=crop" },
  { id: "prod-15", name: "Linen Kurta Set",           sku: "KRT-LNN-015", unitOfMeasure: "pcs", price: 2499, bomId: null, currentStock: 35,  reservedStock: 0, imageUrl: "https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=600&auto=format&fit=crop" },
]

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers: Customer[] = [
  { id: "cust-1", name: "Zara India Pvt Ltd",    contact: "+91-9911001100", email: "orders@zara.in",          address: "Linking Rd, Mumbai 400050",       creditLimit: 1000000, paymentTerms: "Net 45" },
  { id: "cust-2", name: "H&M Retail India",       contact: "+91-9922002200", email: "supply@hm.in",            address: "MG Road, Bengaluru 560001",        creditLimit: 750000,  paymentTerms: "Net 30" },
  { id: "cust-3", name: "Marks & Spencer India",  contact: "+91-9933003300", email: "procurement@mandsindia.com", address: "Khan Market, New Delhi 110003", creditLimit: 500000,  paymentTerms: "Net 30" },
  { id: "cust-4", name: "FabIndia Ltd",           contact: "+91-9944004400", email: "trade@fabindia.com",          address: "Connaught Place, New Delhi 110001",   creditLimit: 300000,  paymentTerms: "Net 15" },
  { id: "cust-5", name: "Myntra Fashion Pvt Ltd", contact: "+91-9955005500", email: "sourcing@myntra.com",         address: "Embassy Tech Village, Bengaluru 560103", creditLimit: 1500000, paymentTerms: "Net 45" },
  { id: "cust-6", name: "Reliance Trends",        contact: "+91-9966006600", email: "procurement@reliancetrends.com", address: "Maker Chambers, Nariman Point, Mumbai 400021", creditLimit: 2000000, paymentTerms: "Net 60" },
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
