"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import type { Customer, Product, SalesOrder, SalesOrderLine } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  Plus, ShoppingCart, Spinner, CheckCircle, Warning, XCircle, ArrowsClockwise, Package, X, CaretRight, Check
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function getSimpleStatus(status: string): SimpleStatus {
  if (["DELIVERED", "PAID"].includes(status)) return "fulfilled"
  if (["SHIPPED", "READY_TO_SHIP"].includes(status)) return "shipping"
  if (status === "NEEDS_RESTOCK") return "needs_restock"
  if (status === "CANCELLED") return "cancelled"
  if (["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION"].includes(status)) return "pending"
  return "other"
}

type SimpleStatus = "pending" | "fulfilled" | "shipping" | "needs_restock" | "cancelled" | "other"

const STATUS_UI: Record<SimpleStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-blue-500/15 text-blue-500" },
  shipping: { label: "Shipping", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  fulfilled: { label: "Fulfilled", color: "bg-emerald-500/15 text-emerald-500" },
  needs_restock: { label: "Needs Restock", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  cancelled: { label: "Cancelled", color: "bg-destructive/15 text-destructive" },
  other: { label: "Other", color: "bg-muted text-muted-foreground" },
}

interface Shortage {
  productId: string
  name: string
  required: number
  available: number
}

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number }

export default function OrdersPage() {
  const router = useRouter()
  const { data: ordersRes, loading: loadingOrders, refetch } = useFetch<PaginatedResponse<SalesOrder> | SalesOrder[]>("/api/sales-orders")
  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  // Current user for RBAC
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch { }
    }
  }, [])

  // Create order dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [lines, setLines] = useState<SalesOrderLine[]>([{ productId: "", qty: 1, unitPrice: 0 }])
  const [saving, setSaving] = useState(false)

  // Unwrap both paginated and array responses
  function unwrap<T>(res: PaginatedResponse<T> | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as PaginatedResponse<T>).data)) return (res as PaginatedResponse<T>).data
    return []
  }

  const allOrders = unwrap(ordersRes)
  const allCustomers = unwrap(customersRes)
  const allProducts = unwrap(productsRes)

  // Stats
  const pending = allOrders.filter((o) => getSimpleStatus(o.status) === "pending")
  const fulfilled = allOrders.filter((o) => getSimpleStatus(o.status) === "fulfilled")
  const needsRestock = allOrders.filter((o) => o.status === "NEEDS_RESTOCK")
  const revenue = fulfilled.reduce((s, o) => s + o.lines.reduce((ss, l) => ss + l.qty * l.unitPrice, 0), 0)

  function updateLine(idx: number, field: keyof SalesOrderLine, value: string | number) {
    setLines((prev) => {
      const next = [...prev]
      if (field === "productId") {
        const prod = allProducts.find((p) => p.id === value)
        next[idx] = { ...next[idx], productId: value as string, unitPrice: prod?.price ?? 0 }
      } else {
        next[idx] = { ...next[idx], [field]: value }
      }
      return next
    })
  }

  async function handleCreate() {
    if (!customerId || lines.some((l) => !l.productId || l.qty <= 0)) {
      toast.error("Please fill in all order fields")
      return
    }
    setSaving(true)
    try {
      await apiPost("/api/sales-orders", { customerId, lines })
      toast.success("Order created")
      setCreateOpen(false)
      setCustomerId("")
      setLines([{ productId: "", qty: 1, unitPrice: 0 }])
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order")
    } finally {
      setSaving(false)
    }
  }



  return (
    <div className="p-6 space-y-5 px-10 w-full mx-auto">
      <title>Orders | ShirtCo ERP</title>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allOrders.length} total orders</p>
        </div>
        {(!currentUser || currentUser.role === "Admin" || currentUser.role === "Sales Executive") && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shadow-sm shadow-primary/20">
            <Plus size={15} weight="bold" /> New Order
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Pending Orders</p>
          <p className="text-2xl font-heading font-bold">{pending.length}</p>
          <p className="text-[11px] text-muted-foreground">Awaiting stock check</p>
        </div>
        <div className={cn("stat-card", needsRestock.length > 0 && "border-amber-500/30 bg-amber-500/5")}>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            {needsRestock.length > 0 && <Warning size={11} className="text-amber-500" weight="fill" />}
            Needs Restock
          </p>
          <p className={cn("text-2xl font-heading font-bold", needsRestock.length > 0 && "text-amber-500")}>
            {needsRestock.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Stock shortage flagged</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Fulfilled</p>
          <p className="text-2xl font-heading font-bold text-emerald-500">{fulfilled.length}</p>
          <p className="text-[11px] text-muted-foreground">Orders completed</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Revenue</p>
          <p className="text-2xl font-heading font-bold">{formatINR(revenue)}</p>
          <p className="text-[11px] text-muted-foreground">From fulfilled orders</p>
        </div>
      </div>

      {/* Orders table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="table-header-row">
              <TableHead className="font-semibold text-xs">Order ID</TableHead>
              <TableHead className="font-semibold text-xs">Customer</TableHead>
              <TableHead className="font-semibold text-xs">Date</TableHead>
              <TableHead className="font-semibold text-xs">Items</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              <TableHead className="font-semibold text-xs text-right">Total</TableHead>
              <TableHead className="font-semibold text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingOrders && [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(7)].map((_, j) => (
                  <TableCell key={j}><div className="shimmer h-4 rounded" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!loadingOrders && allOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-20 text-center text-muted-foreground">
                  <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No orders found</p>
                  <p className="text-sm mt-1">Create your first order to get started</p>
                </TableCell>
              </TableRow>
            )}
            {!loadingOrders && allOrders.map((order) => {
              const cust = allCustomers.find((c) => c.id === order.customerId)
              const simple = getSimpleStatus(order.status)
              const ui = STATUS_UI[simple]
              const total = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
              
              // Extract unique images to display in the avatar stack
              const images = order.lines.map(l => l.imageUrl).filter(Boolean) as string[]
              const uniqueImages = Array.from(new Set(images))

              return (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  <TableCell className="font-mono text-xs font-semibold text-primary">{order.id}</TableCell>
                  <TableCell className="font-medium text-[13px]">{cust?.name ?? "—"}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center group relative h-8 w-16 z-0 hover:z-50 cursor-pointer">
                      {uniqueImages.slice(0, 5).map((img, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden transition-all duration-300 ease-out shadow-sm",
                            "translate-x-[var(--stack-x)] group-hover:translate-x-[var(--hover-x)]"
                          )}
                          style={{
                            zIndex: 50 - idx,
                            "--stack-x": `${idx * 5}px`,
                            "--hover-x": `${idx * 24}px`,
                          } as React.CSSProperties}
                        >
                          <img src={img} alt="Product" className="w-full h-full object-cover" />
                        </div>
                      ))}
                      {uniqueImages.length > 5 && (
                        <div 
                          className={cn(
                            "absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold transition-all duration-300 ease-out shadow-sm",
                            "translate-x-[var(--stack-x)] group-hover:translate-x-[var(--hover-x)]"
                          )}
                          style={{
                            zIndex: 40,
                            "--stack-x": `${5 * 5}px`,
                            "--hover-x": `${5 * 24}px`,
                          } as React.CSSProperties}
                        >
                          +{uniqueImages.length - 5}
                        </div>
                      )}
                      {uniqueImages.length === 0 && (
                        <span className="text-xs text-muted-foreground/50 italic px-2">No images</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`badge-status ${ui.color}`}>{ui.label}</span>
                  </TableCell>
                  <TableCell className="font-bold text-[13px] text-right">{formatINR(total)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground hover:text-foreground">
                      Manage <CaretRight weight="bold" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Create Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ShoppingCart size={18} className="text-primary" /> New Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Select Customer —</option>
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                Order Lines *
              </label>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(idx, "productId", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                    >
                      <option value="">— Product —</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.currentStock})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number" min={1} value={line.qty}
                      onChange={(e) => updateLine(idx, "qty", parseInt(e.target.value) || 1)}
                      className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-center font-bold"
                      placeholder="Qty"
                    />
                    <span className="text-[11px] text-muted-foreground w-20 text-right shrink-0 font-bold">
                      {line.unitPrice > 0 ? formatINR(line.qty * line.unitPrice) : "—"}
                    </span>
                    {lines.length > 1 && (
                      <button
                        onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline" size="sm" className="gap-1 w-full border-dashed"
                onClick={() => setLines((l) => [...l, { productId: "", qty: 1, unitPrice: 0 }])}
              >
                <Plus size={12} /> Add Line
              </Button>
            </div>

            {/* Order total preview */}
            {lines.some((l) => l.unitPrice > 0) && (
              <div className="rounded-lg bg-muted/30 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">Order Total</span>
                <span className="font-bold text-sm">
                  {formatINR(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!customerId || lines.some((l) => !l.productId || l.qty <= 0) || saving}
            >
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
