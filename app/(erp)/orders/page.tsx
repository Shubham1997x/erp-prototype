"use client"

import { useState, useEffect } from "react"
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
  pending:       { label: "Pending",       color: "bg-blue-500/15 text-blue-500" },
  shipping:      { label: "Shipping",      color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  fulfilled:     { label: "Fulfilled",     color: "bg-emerald-500/15 text-emerald-500" },
  needs_restock: { label: "Needs Restock", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  cancelled:     { label: "Cancelled",     color: "bg-destructive/15 text-destructive" },
  other:         { label: "Other",         color: "bg-muted text-muted-foreground" },
}

interface Shortage {
  productId: string
  name: string
  required: number
  available: number
}

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number }

export default function OrdersPage() {
  const { data: ordersRes, loading: loadingOrders, refetch } = useFetch<PaginatedResponse<SalesOrder> | SalesOrder[]>("/api/sales-orders")
  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  // Current user for RBAC
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch {}
    }
  }, [])

  // Create order dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [lines, setLines] = useState<SalesOrderLine[]>([{ productId: "", qty: 1, unitPrice: 0 }])
  const [saving, setSaving] = useState(false)

  // Action states
  const [checkingId, setCheckingId] = useState<string | null>(null)
  const [restockDialog, setRestockDialog] = useState<{
    order: SalesOrder
    shortages: Shortage[]
  } | null>(null)
  const [restockForm, setRestockForm] = useState<Record<string, { qty: number; invoiceDetails: string }>>({})
  const [restocking, setRestocking] = useState(false)

  // Cancel
  const [cancelTarget, setCancelTarget] = useState<SalesOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Ship order dialog
  const [shipDialog, setShipDialog] = useState<SalesOrder | null>(null)
  const [shipForm, setShipForm] = useState({ carrier: "", trackingNumber: "" })
  const [shipping, setShipping] = useState(false)

  // Sheet View Order
  const [viewOrder, setViewOrder] = useState<SalesOrder | null>(null)

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
  const pending   = allOrders.filter((o) => getSimpleStatus(o.status) === "pending")
  const fulfilled = allOrders.filter((o) => getSimpleStatus(o.status) === "fulfilled")
  const needsRestock = allOrders.filter((o) => o.status === "NEEDS_RESTOCK")
  const revenue   = fulfilled.reduce((s, o) => s + o.lines.reduce((ss, l) => ss + l.qty * l.unitPrice, 0), 0)

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

  async function handleCheckStock(order: SalesOrder) {
    setCheckingId(order.id)
    try {
      const res = await apiPost(`/api/sales-orders/${order.id}/fulfill`, {})
      const data = res as { status: string; shortages: Shortage[] }
      if (data.status === "READY_TO_SHIP") {
        toast.success("✓ Stock reserved — order ready to ship!")
        refetch()
      } else if (data.status === "NEEDS_RESTOCK") {
        toast.warning("Stock shortage detected — Restock Request raised!")
        refetch()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stock check failed")
    } finally {
      setCheckingId(null)
    }
  }

  async function handleRestock() {
    if (!restockDialog) return
    setRestocking(true)
    try {
      // For each shortage, add stock
      for (const [productId, { qty, invoiceDetails }] of Object.entries(restockForm)) {
        if (qty <= 0) continue
        await apiPost("/api/stock", {
          entityType: "product",
          entityId: productId,
          delta: qty,
          reason: `Restock${invoiceDetails ? ` - Invoice: ${invoiceDetails}` : ""}`,
        })
      }
      // Now try to fulfill the order
      const res = await apiPost(`/api/sales-orders/${restockDialog.order.id}/fulfill`, {})
      const data = res as { status: string }
      if (data.status === "READY_TO_SHIP") {
        toast.success("Stock added & order is Ready to Ship!")
      } else {
        toast.success("Stock restocked — please check the order again")
      }
      setRestockDialog(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restock failed")
    } finally {
      setRestocking(false)
    }
  }

  async function handleShip() {
    if (!shipDialog) return
    setShipping(true)
    try {
      await apiPost(`/api/sales-orders/${shipDialog.id}/ship`, shipForm)
      toast.success("Order Shipped!")
      setShipDialog(null)
      setShipForm({ carrier: "", trackingNumber: "" })
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to ship order")
    } finally {
      setShipping(false)
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await apiPost(`/api/sales-orders/${cancelTarget.id}/cancel`, { reason: "Manually cancelled" })
      toast.success("Order cancelled")
      setCancelTarget(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel")
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
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
              <TableHead className="font-semibold text-xs">Items</TableHead>
              <TableHead className="font-semibold text-xs">Total</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              <TableHead className="font-semibold text-xs">Date</TableHead>
              <TableHead className="font-semibold text-xs">Actions</TableHead>
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
                  <p className="font-medium">No orders yet</p>
                  <p className="text-sm mt-1">Create your first order to get started</p>
                </TableCell>
              </TableRow>
            )}
            {!loadingOrders && allOrders.map((order) => {
              const cust = allCustomers.find((c) => c.id === order.customerId)
              const simple = getSimpleStatus(order.status)
              const ui = STATUS_UI[simple]
              const total = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)

              return (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setViewOrder(order)}
                >
                  <TableCell className="font-mono text-xs font-semibold text-primary">{order.id}</TableCell>
                  <TableCell className="font-medium text-[13px]">{cust?.name ?? "—"}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
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

      {/* ── Restock Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!restockDialog} onOpenChange={(o) => !o && setRestockDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Package size={18} weight="fill" /> Restock Required
            </DialogTitle>
          </DialogHeader>
          {restockDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Order <span className="font-mono font-bold text-foreground">{restockDialog.order.id}</span> needs
                the following items to be restocked before it can be fulfilled.
              </p>

              <div className="space-y-3">
                {restockDialog.shortages.map((s) => (
                  <div key={s.productId} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Need <span className="font-bold text-foreground">{s.required}</span> · Have{" "}
                          <span className="font-bold text-amber-500">{s.available}</span> · Short by{" "}
                          <span className="font-bold text-destructive">{s.required - s.available}</span>
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                          Qty to Add
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={restockForm[s.productId]?.qty ?? s.required - s.available}
                          onChange={(e) => setRestockForm((f) => ({
                            ...f,
                            [s.productId]: { ...f[s.productId], qty: parseInt(e.target.value) || 0 }
                          }))}
                          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                          Invoice Details (Optional)
                        </label>
                        <input
                          type="text"
                          value={restockForm[s.productId]?.invoiceDetails ?? ""}
                          onChange={(e) => setRestockForm((f) => ({
                            ...f,
                            [s.productId]: { ...f[s.productId], invoiceDetails: e.target.value }
                          }))}
                          placeholder="e.g. INV-1234 from Supplier"
                          className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockDialog(null)}>Cancel</Button>
            <Button
              onClick={handleRestock}
              disabled={restocking}
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-sm shadow-amber-500/20"
            >
              {restocking && <Spinner size={14} className="animate-spin" />}
              <Package size={14} /> Add Stock & Fulfill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Ship Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!shipDialog} onOpenChange={(o) => !o && setShipDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Package size={18} className="text-teal-600" /> Shipping Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Order <span className="font-mono font-bold text-foreground">{shipDialog?.id}</span> is ready to ship. Enter logistics details to finalize.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrier</label>
              <input
                value={shipForm.carrier}
                onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                placeholder="e.g. BlueDart, FedEx"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking Number</label>
              <input
                value={shipForm.trackingNumber}
                onChange={(e) => setShipForm({ ...shipForm, trackingNumber: e.target.value })}
                placeholder="e.g. 1Z9999W9999"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialog(null)}>Cancel</Button>
            <Button onClick={handleShip} disabled={shipping} className="bg-teal-600 hover:bg-teal-700 text-white">
              {shipping && <Spinner size={14} className="animate-spin mr-1" />}
              Mark as Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel Confirm Dialog ───────────────────────────────────────────── */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive flex items-center gap-2">
              <XCircle size={18} weight="fill" /> Cancel Order?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Are you sure you want to cancel order{" "}
            <span className="font-mono font-bold text-foreground">{cancelTarget?.id}</span>?
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep Order</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Spinner size={14} className="animate-spin mr-1" />}
              Cancel Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Slide-out Sheet for Order Details ───────────────────────────── */}
      <Sheet open={!!viewOrder} onOpenChange={(o) => !o && setViewOrder(null)}>
        <SheetContent className="sm:max-w-md w-[400px] flex flex-col gap-0 p-0 border-l border-border bg-background">
          {viewOrder && (() => {
            const cust = allCustomers.find((c) => c.id === viewOrder.customerId)
            const simple = getSimpleStatus(viewOrder.status)
            const ui = STATUS_UI[simple]
            const total = viewOrder.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0)

            // RBAC
            const isSales = !currentUser || currentUser.role === "Admin" || currentUser.role === "Sales Executive"
            const isInventory = !currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager"

            const canCheck = isSales && ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION"].includes(viewOrder.status)
            const canRestock = isInventory && viewOrder.status === "NEEDS_RESTOCK"
            const canShip = isSales && viewOrder.status === "READY_TO_SHIP"
            const canCancel = isSales && !["DELIVERED", "CANCELLED", "PAID", "SHIPPED"].includes(viewOrder.status)

            return (
              <>
                <SheetHeader className="p-6 border-b text-left">
                  <div className="flex items-center justify-between mb-1">
                    <SheetTitle className="font-mono text-lg">{viewOrder.id}</SheetTitle>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide", ui.color)}>
                      {ui.label}
                    </span>
                  </div>
                  <SheetDescription>
                    Placed on {formatDate(viewOrder.createdAt)}
                  </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                  {/* Customer Info */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      Customer
                      <div className="h-px bg-border flex-1"></div>
                    </h3>
                    <div>
                      <div className="font-semibold text-foreground">{cust?.name || "Unknown Customer"}</div>
                      {cust?.email && <div className="text-sm text-muted-foreground">{cust.email}</div>}
                    </div>
                  </div>

                  {/* Products */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                      Line Items
                      <div className="h-px bg-border flex-1"></div>
                    </h3>
                    <div className="rounded-xl border bg-card overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewOrder.lines.map((l, i) => {
                            const p = allProducts.find((p) => p.id === l.productId)
                            return (
                              <TableRow key={i} className="hover:bg-transparent">
                                <TableCell>
                                  <div className="font-medium">{p?.name || l.productId}</div>
                                  <div className="text-xs text-muted-foreground">{formatINR(l.unitPrice)} each</div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{l.qty}</TableCell>
                                <TableCell className="text-right font-medium">{formatINR(l.qty * l.unitPrice)}</TableCell>
                              </TableRow>
                            )
                          })}
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={2} className="font-bold text-right">Grand Total</TableCell>
                            <TableCell className="text-right font-bold text-primary">{formatINR(total)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Logistics */}
                  {(viewOrder.tracking_number || viewOrder.carrier || viewOrder.status === "SHIPPED") && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                        Logistics
                        <div className="h-px bg-border flex-1"></div>
                      </h3>
                      <div className="bg-teal-500/10 rounded-xl p-4 border border-teal-500/20 text-sm">
                        <div className="grid grid-cols-2 gap-y-2">
                          <div className="text-muted-foreground">Carrier:</div>
                          <div className="font-medium text-foreground">{viewOrder.carrier || "Not specified"}</div>
                          <div className="text-muted-foreground">Tracking:</div>
                          <div className="font-mono font-bold text-teal-700 dark:text-teal-400">{viewOrder.tracking_number || "Pending"}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="p-6 border-t bg-muted/20 mt-auto">
                  {(simple === "fulfilled" || viewOrder.status === "SHIPPED") ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-emerald-600 font-semibold bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <CheckCircle size={20} weight="fill" /> Order is fully processed
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {canCheck && (
                        <Button
                          className="w-full gap-2 bg-primary/90 hover:bg-primary"
                          onClick={() => handleCheckStock(viewOrder)}
                          disabled={checkingId === viewOrder.id}
                        >
                          {checkingId === viewOrder.id ? <Spinner size={16} className="animate-spin" /> : <Check size={16} />} 
                          Check Stock & Reserve
                        </Button>
                      )}
                      
                      {canRestock && (
                        <div className="space-y-2">
                          <div className="text-xs text-center text-amber-600 bg-amber-500/10 p-2 rounded border border-amber-500/20 flex flex-col items-center gap-1">
                            <Warning weight="fill" size={16} /> 
                            Stock shortage detected
                          </div>
                          <Button
                            className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => {
                              setViewOrder(null)
                              // Rebuild shortage info from order lines vs current stock
                              const shortages: Shortage[] = viewOrder.lines
                                .map((l) => {
                                  const prod = allProducts.find((p) => p.id === l.productId)
                                  return {
                                    productId: l.productId,
                                    name: prod?.name ?? l.productId,
                                    required: l.qty,
                                    available: prod?.currentStock ?? 0,
                                  }
                                })
                                .filter((s) => s.available < s.required)
                              const form: Record<string, { qty: number; invoiceDetails: string }> = {}
                              for (const s of shortages) {
                                form[s.productId] = {
                                  qty: s.required - s.available,
                                  invoiceDetails: "",
                                }
                              }
                              setRestockForm(form)
                              setRestockDialog({ order: viewOrder, shortages })
                            }}
                          >
                            <Package size={16} /> Fulfill Restock Request
                          </Button>
                        </div>
                      )}

                      {!canRestock && viewOrder.status === "NEEDS_RESTOCK" && (
                        <div className="text-xs text-center text-amber-600 bg-amber-500/10 p-2.5 rounded border border-amber-500/20 flex items-center justify-center gap-2 font-medium">
                          <Spinner size={14} className="animate-spin" />
                          Waiting for Inventory Manager to Restock
                        </div>
                      )}

                      {canShip && (
                        <Button
                          className="w-full gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                          onClick={() => {
                            setShipForm({ carrier: "", trackingNumber: "" })
                            setShipDialog(viewOrder)
                          }}
                        >
                          <Package size={16} /> Ship Order
                        </Button>
                      )}

                      {canCancel && (
                        <Button
                          variant="outline"
                          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
                          onClick={() => {
                            setViewOrder(null)
                            setCancelTarget(viewOrder)
                          }}
                        >
                          Cancel Order
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>

    </div>
  )
}
