"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import type { Customer, Product, SalesOrder, SalesOrderStatus, SalesOrderLine } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plus, ArrowRight, ShoppingCart, Spinner, Lock, ClipboardText, Factory, Truck, CheckSquare, XCircle, Warning } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_META: Record<SalesOrderStatus, { label: string; color: string }> = {
  DRAFT:                { label: "Draft",              color: "bg-muted text-muted-foreground" },
  SUBMITTED:            { label: "Submitted",          color: "bg-blue-500/15 text-blue-500" },
  INVENTORY_CHECK:      { label: "Inventory Check",    color: "bg-yellow-500/15 text-yellow-500" },
  APPROVED:             { label: "Approved",           color: "bg-emerald-500/15 text-emerald-500" },
  IN_PRODUCTION:        { label: "In Production",      color: "bg-violet-500/15 text-violet-500" },
  READY_TO_SHIP:        { label: "Ready to Ship",      color: "bg-cyan-500/15 text-cyan-500" },
  SHIPPED:              { label: "Shipped",            color: "bg-indigo-500/15 text-indigo-400" },
  DELIVERED:            { label: "Delivered",          color: "bg-green-500/15 text-green-500" },
  CANCELLED:            { label: "Cancelled",          color: "bg-destructive/15 text-destructive" },
  PARTIALLY_FULFILLED:  { label: "Partially Fulfilled",color: "bg-orange-500/15 text-orange-500" },
  INVOICED:             { label: "Invoiced",           color: "bg-teal-500/15 text-teal-500" },
  PAID:                 { label: "Paid",               color: "bg-green-600/15 text-green-600" },
  DISPUTED:             { label: "Disputed",           color: "bg-rose-500/15 text-rose-500" },
  CREDIT_HOLD:          { label: "Credit Hold",        color: "bg-red-600/20 text-red-600" },
}

const NEXT_STATUS: Partial<Record<SalesOrderStatus, SalesOrderStatus>> = {
  DRAFT: "SUBMITTED",
  SUBMITTED: "INVENTORY_CHECK",
  INVENTORY_CHECK: "APPROVED",
  APPROVED: "IN_PRODUCTION",
  IN_PRODUCTION: "READY_TO_SHIP",
  READY_TO_SHIP: "SHIPPED",
  SHIPPED: "DELIVERED",
}

const STATUS_ACTION_LABELS: Partial<Record<SalesOrderStatus, string>> = {
  DRAFT: "Submit Order",
  SUBMITTED: "Check Stock",
  APPROVED: "Release to Mfg",
}

// Statuses that can be cancelled
const CANCELLABLE_STATUSES: SalesOrderStatus[] = [
  "DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION",
]

function OrderProgress({ status }: { status: SalesOrderStatus }) {
  const steps: { label: string; statuses: SalesOrderStatus[] }[] = [
    { label: "Draft", statuses: ["DRAFT"] },
    { label: "Submitted", statuses: ["SUBMITTED"] },
    { label: "Stock Check", statuses: ["INVENTORY_CHECK"] },
    { label: "Approved", statuses: ["APPROVED"] },
    { label: "Production", statuses: ["IN_PRODUCTION"] },
    { label: "Ready", statuses: ["READY_TO_SHIP"] },
    { label: "Delivered", statuses: ["SHIPPED", "DELIVERED"] },
  ]

  const currentIdx = steps.findIndex((step) => step.statuses.includes(status))
  const isCancelled = status === "CANCELLED"
  const isCreditHold = status === "CREDIT_HOLD"

  if (isCancelled) {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-500">
        Cancelled
      </span>
    )
  }

  if (isCreditHold) {
    return (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-red-600/10 text-red-600">
        Credit Hold
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1 w-full max-w-[140px]">
      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
        <span>Progress</span>
        <span className="text-primary font-extrabold">{currentIdx >= 0 ? `${Math.round(((currentIdx + 1) / steps.length) * 100)}%` : "0%"}</span>
      </div>
      <div className="flex items-center gap-1">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIdx
          const isActive = idx === currentIdx
          return (
            <div
              key={idx}
              title={step.label}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                isCompleted && "bg-emerald-500",
                isActive && "bg-primary animate-pulse shadow-sm shadow-primary/50 scale-y-110",
                !isCompleted && !isActive && "bg-muted"
              )}
            />
          )
        })}
      </div>
    </div>
  )
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export default function SalesOrdersPage() {
  const { isSales, loading: loadingUser } = useUser()
  const { data: ordersResponse, loading, refetch } = useFetch<PaginatedResponse<SalesOrder> | SalesOrder[]>("/api/sales-orders")
  const { data: customers } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: products } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("intake")
  const [saving, setSaving] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [lines, setLines] = useState<SalesOrderLine[]>([{ productId: "", qty: 1, unitPrice: 0 }])
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState("")

  // Cancel order state
  const [cancelOrder, setCancelOrder] = useState<SalesOrder | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [cancelling, setCancelling] = useState(false)

  // Normalise paginated-or-array responses
  const allOrders: SalesOrder[] = ordersResponse
    ? Array.isArray(ordersResponse) ? ordersResponse : (ordersResponse as PaginatedResponse<SalesOrder>).data
    : []
  const allCustomers: Customer[] = customers
    ? Array.isArray(customers) ? customers : (customers as PaginatedResponse<Customer>).data
    : []
  const allProducts: Product[] = products
    ? Array.isArray(products) ? products : (products as PaginatedResponse<Product>).data
    : []

  // Dynamic stage-based metrics calculations
  const intakeOrders = allOrders.filter((o) => ["DRAFT", "SUBMITTED", "INVENTORY_CHECK"].includes(o.status))
  const intakeValue = intakeOrders.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 0)

  const mfgOrders = allOrders.filter((o) => ["APPROVED", "IN_PRODUCTION"].includes(o.status))
  const mfgQty = mfgOrders.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.qty, 0), 0)

  const fulfillmentOrders = allOrders.filter((o) => ["READY_TO_SHIP", "SHIPPED"].includes(o.status))

  const deliveredOrders = allOrders.filter((o) => o.status === "DELIVERED")
  const deliveredRevenue = deliveredOrders.reduce((sum, o) => sum + o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 0)

  // Filter based on active workflow tab selection
  const filtered = allOrders.filter((so) => {
    if (activeTab === "intake") return ["DRAFT", "SUBMITTED", "INVENTORY_CHECK"].includes(so.status)
    if (activeTab === "production") return ["APPROVED", "IN_PRODUCTION"].includes(so.status)
    if (activeTab === "fulfillment") return ["READY_TO_SHIP", "SHIPPED", "DELIVERED"].includes(so.status)
    return true // "all"
  })

  async function handleStatusChange(id: string, status: SalesOrderStatus) {
    try {
      await apiPatch(`/api/sales-orders/${id}/status`, { status })
      toast.success(`Order moved to ${STATUS_META[status].label}`)
      refetch()
    } catch {
      toast.error("Failed to update status")
    }
  }

  async function handleCancelOrder() {
    if (!cancelOrder) return
    if (!cancelReason.trim()) { toast.error("Please provide a reason for cancellation"); return }
    setCancelling(true)
    try {
      await apiPost(`/api/sales-orders/${cancelOrder.id}/cancel`, { reason: cancelReason })
      toast.success("Order cancelled successfully")
      setCancelOrder(null)
      setCancelReason("")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel order")
    } finally {
      setCancelling(false)
    }
  }

  async function handleCreate() {
    if (!customerId || lines.some((l) => !l.productId || l.qty <= 0)) return
    setSaving(true)
    try {
      await apiPost("/api/sales-orders", {
        customerId,
        lines,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
      })
      toast.success("Sales order created")
      setOpen(false)
      setCustomerId("")
      setLines([{ productId: "", qty: 1, unitPrice: 0 }])
      setRequestedDeliveryDate("")
      refetch()
    } catch {
      toast.error("Failed to create order")
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>Sales Orders | ShirtCo ERP</title>
      <div className="page-header">
        <div>
          <h1 className="section-title">Sales Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allOrders.length} total orders across lifecycle</p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          disabled={loadingUser || !isSales}
          className="gap-2 shadow-sm shadow-primary/20"
        >
          {(!loadingUser && !isSales) ? <Lock size={15} weight="bold" /> : <Plus size={15} weight="bold" />} New Order
        </Button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Intake Pipeline</p>
            <ClipboardText size={18} className="text-blue-500 opacity-80" />
          </div>
          <p className="text-2xl font-heading font-bold">{intakeOrders.length} Orders</p>
          <p className="text-[11px] text-muted-foreground">Value: {formatINR(intakeValue)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Active Manufacturing</p>
            <Factory size={18} className="text-violet-500 opacity-80" />
          </div>
          <p className="text-2xl font-heading font-bold">{mfgOrders.length} Orders</p>
          <p className="text-[11px] text-muted-foreground">{mfgQty.toLocaleString("en-IN")} shirts queued</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Fulfillment Pipeline</p>
            <Truck size={18} className="text-cyan-500 opacity-80" />
          </div>
          <p className="text-2xl font-heading font-bold">{fulfillmentOrders.length} in Transit</p>
          <p className="text-[11px] text-muted-foreground">Packing & dispatched status</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">Completed Revenue</p>
            <CheckSquare size={18} className="text-emerald-500 opacity-80" />
          </div>
          <p className="text-2xl font-heading font-bold text-emerald-500">{formatINR(deliveredRevenue)}</p>
          <p className="text-[11px] text-muted-foreground">{deliveredOrders.length} orders delivered</p>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="intake">Intake & Verification ({intakeOrders.length})</TabsTrigger>
          <TabsTrigger value="production">Manufacturing ({mfgOrders.length})</TabsTrigger>
          <TabsTrigger value="fulfillment">Fulfillment ({fulfillmentOrders.length + deliveredOrders.length})</TabsTrigger>
          <TabsTrigger value="all">All Orders ({allOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="table-header-row">
                  <TableHead className="font-semibold text-xs">Order ID</TableHead>
                  <TableHead className="font-semibold text-xs">Customer</TableHead>
                  <TableHead className="font-semibold text-xs">Items</TableHead>
                  <TableHead className="font-semibold text-xs">Total Value</TableHead>
                  <TableHead className="font-semibold text-xs">Status</TableHead>
                  <TableHead className="font-semibold text-xs">Progress</TableHead>
                  <TableHead className="font-semibold text-xs">Req. Delivery</TableHead>
                  <TableHead className="font-semibold text-xs">Promised</TableHead>
                  <TableHead className="font-semibold text-xs">Date</TableHead>
                  <TableHead className="font-semibold text-xs">Next Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(10)].map((_, j) => (
                      <TableCell key={j}><div className="shimmer h-4 rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-16 text-center text-muted-foreground">
                      <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No orders found in this stage</p>
                      <p className="text-sm mt-1">Select another stage or create a new order</p>
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((so) => {
                  const customer = allCustomers.find((c) => c.id === so.customerId)
                  const total = so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                  const meta = STATUS_META[so.status] ?? { label: so.status, color: "bg-muted text-muted-foreground" }
                  const next = NEXT_STATUS[so.status]
                  const canTransitionManually = ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED"].includes(so.status)
                  const canCancel = CANCELLABLE_STATUSES.includes(so.status)
                  const isCreditHold = so.status === "CREDIT_HOLD"
                  const isBackorder = !!so.parentOrderId

                  // Stock availability analysis for INVENTORY_CHECK stage
                  let isAllStockAvailable = true
                  const shortages: string[] = []
                  if (so.status === "INVENTORY_CHECK") {
                    for (const l of so.lines) {
                      const prod = allProducts.find((p) => p.id === l.productId)
                      if (!prod || prod.currentStock < l.qty) {
                        isAllStockAvailable = false
                        const name = prod?.name ?? l.productId
                        shortages.push(`${name} (Short: ${l.qty - (prod?.currentStock ?? 0)})`)
                      }
                    }
                  }

                  return (
                    <TableRow key={so.id} className={cn("hover:bg-muted/20 transition-colors", isCreditHold && "bg-red-500/5")}>
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {so.id}
                        {isBackorder && (
                          <span className="ml-1 text-[9px] font-bold text-amber-600 bg-amber-500/10 px-1 py-0.5 rounded">
                            Backorder
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-[13px]">{customer?.name ?? "—"}</TableCell>
                      <TableCell className="text-[13px]">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {so.lines.map((l, idx) => {
                            const prod = allProducts.find((p) => p.id === l.productId)
                            return (
                              <span
                                key={idx}
                                className="inline-block text-[10px] px-2 py-0.5 rounded-md bg-muted font-medium text-muted-foreground truncate"
                                title={prod?.name ?? l.productId}
                              >
                                {l.qty}x {prod?.name ?? l.productId}
                              </span>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-[13px]">{formatINR(total)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className={`badge-status ${meta.color}`}>{meta.label}</span>
                          {isCreditHold && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
                              <Warning size={10} weight="fill" /> Credit Hold
                            </span>
                          )}
                          {so.status === "INVENTORY_CHECK" && (
                            <p className={cn(
                              "text-[10px] mt-1 font-semibold leading-tight",
                              isAllStockAvailable ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                            )} title={shortages.length > 0 ? "Shortages:\n" + shortages.join("\n") : "Stock is available for all items"}>
                              {isAllStockAvailable ? "✓ In Stock" : "⚠ Stock Shortage"}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <OrderProgress status={so.status} />
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {formatDate(so.requestedDeliveryDate)}
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {formatDate(so.promisedDeliveryDate)}
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{formatDate(so.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1.5">
                          {canTransitionManually && next ? (
                            so.status === "INVENTORY_CHECK" ? (
                              <div className="flex flex-col gap-1.5 max-w-[150px]">
                                <Button
                                  variant="default"
                                  size="xs"
                                  className={cn(
                                    "gap-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm shadow-emerald-500/10",
                                    (!isAllStockAvailable) && "opacity-50 pointer-events-none"
                                  )}
                                  disabled={loadingUser || !isSales || !isAllStockAvailable}
                                  onClick={() => handleStatusChange(so.id, "READY_TO_SHIP")}
                                >
                                  {(!loadingUser && !isSales) ? <Lock size={10} /> : null}
                                  Fulfill from Stock
                                </Button>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  className="gap-1 text-[11px] font-semibold"
                                  disabled={loadingUser || !isSales}
                                  onClick={() => handleStatusChange(so.id, "APPROVED")}
                                >
                                  {(!loadingUser && !isSales) ? <Lock size={10} /> : null}
                                  Queue Production
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="xs"
                                className="gap-1 text-[11px]"
                                disabled={loadingUser || !isSales}
                                onClick={() => handleStatusChange(so.id, next)}
                              >
                                {(!loadingUser && !isSales) ? <Lock size={10} /> : null}
                                {STATUS_ACTION_LABELS[so.status]} <ArrowRight size={10} />
                              </Button>
                            )
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic font-medium">
                              {so.status === "IN_PRODUCTION" && "In Production (MES)"}
                              {so.status === "READY_TO_SHIP" && "Awaiting Dispatch"}
                              {so.status === "SHIPPED" && "In Transit"}
                              {so.status === "DELIVERED" && "Delivered"}
                              {so.status === "CANCELLED" && "Cancelled"}
                              {so.status === "CREDIT_HOLD" && "Pending Credit Review"}
                            </span>
                          )}
                          {canCancel && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="gap-1 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/5"
                              disabled={loadingUser || !isSales}
                              onClick={() => { setCancelOrder(so); setCancelReason("") }}
                            >
                              <XCircle size={10} /> Cancel Order
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">New Sales Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold">
                <option value="">-- Select Customer --</option>
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Requested Delivery Date <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={requestedDeliveryDate}
                onChange={(e) => setRequestedDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Order Lines</label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select value={line.productId} onChange={(e) => updateLine(idx, "productId", e.target.value)}
                      className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs">
                      <option value="">-- Product --</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input type="number" min={1} value={line.qty}
                      onChange={(e) => updateLine(idx, "qty", parseInt(e.target.value) || 1)}
                      className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-center font-bold"
                      placeholder="Qty" />
                    <span className="text-[11px] text-muted-foreground w-20 text-right shrink-0 font-bold">
                      {line.unitPrice > 0 ? formatINR(line.qty * line.unitPrice) : "—"}
                    </span>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1 w-full border-dashed"
                onClick={() => setLines((l) => [...l, { productId: "", qty: 1, unitPrice: 0 }])}>
                <Plus size={12} /> Add Line
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!customerId || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />} Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={!!cancelOrder} onOpenChange={(o) => !o && setCancelOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-destructive">
              <XCircle size={20} weight="fill" /> Cancel Order
            </DialogTitle>
          </DialogHeader>
          {cancelOrder && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold text-destructive mb-1">You are about to cancel order {cancelOrder.id}</p>
                <p className="text-muted-foreground text-xs">
                  This action cannot be undone. Any reserved inventory will be released.
                </p>
              </div>
              {cancelOrder.status === "CREDIT_HOLD" && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm flex items-start gap-2">
                  <Warning size={16} className="text-red-600 mt-0.5 shrink-0" weight="fill" />
                  <p className="text-red-700 dark:text-red-400 font-medium text-xs">
                    This order is on Credit Hold. Cancelling will notify the finance team.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Cancellation Reason <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer requested cancellation, duplicate order..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOrder(null)}>Keep Order</Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling && <Spinner size={14} className="animate-spin mr-1" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
