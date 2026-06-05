"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type { Customer, Product, SalesOrder, SalesOrderLine, SalesOrderStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus, ShoppingCart, Spinner, Warning, Package, X, CaretRight, CheckCircle, Clock, FileArrowDown
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { INVOICE_ELIGIBLE_STATUSES } from "@/lib/invoice-html"
import { downloadSalesOrderInvoice } from "@/lib/download-invoice"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

type OrderTabId =
  | "all"
  | "in_progress"
  | "needs_restock"
  | "ready_to_ship"
  | "shipped"
  | "completed"
  | "cancelled"

const IN_PROGRESS_STATUSES: SalesOrderStatus[] = [
  "DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION", "CREDIT_HOLD", "PARTIALLY_FULFILLED",
]
const COMPLETED_STATUSES: SalesOrderStatus[] = ["DELIVERED", "INVOICED", "PAID", "DISPUTED"]

/** Workflow tabs first; "All" is always last. */
const ORDER_TABS: { id: OrderTabId; label: string; statuses: SalesOrderStatus[] | null }[] = [
  { id: "in_progress", label: "In progress", statuses: IN_PROGRESS_STATUSES },
  { id: "needs_restock", label: "Needs restock", statuses: ["NEEDS_RESTOCK"] },
  { id: "ready_to_ship", label: "Ready to ship", statuses: ["READY_TO_SHIP"] },
  { id: "shipped", label: "Shipped", statuses: ["SHIPPED"] },
  { id: "completed", label: "Completed", statuses: COMPLETED_STATUSES },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { id: "all", label: "All orders", statuses: null },
]

const ORDER_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-muted text-muted-foreground" },
  SUBMITTED: { label: "Submitted", color: "bg-blue-500/15 text-blue-500" },
  INVENTORY_CHECK: { label: "Stock check", color: "bg-blue-500/15 text-blue-500" },
  APPROVED: { label: "Approved", color: "bg-blue-500/15 text-blue-500" },
  IN_PRODUCTION: { label: "In production", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  CREDIT_HOLD: { label: "Credit hold", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  PARTIALLY_FULFILLED: { label: "Partial", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  NEEDS_RESTOCK: { label: "Needs restock", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  READY_TO_SHIP: { label: "Ready to ship", color: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  SHIPPED: { label: "Shipped", color: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  DELIVERED: { label: "Delivered", color: "bg-emerald-500/15 text-emerald-500" },
  INVOICED: { label: "Invoiced", color: "bg-emerald-500/15 text-emerald-500" },
  PAID: { label: "Paid", color: "bg-emerald-500/15 text-emerald-500" },
  DISPUTED: { label: "Disputed", color: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  CANCELLED: { label: "Cancelled", color: "bg-destructive/15 text-destructive" },
}

function orderInTab(order: SalesOrder, tab: OrderTabId): boolean {
  const def = ORDER_TABS.find((t) => t.id === tab)
  if (!def || def.statuses === null) return true
  return def.statuses.includes(order.status)
}

function countForTab(orders: SalesOrder[], tab: OrderTabId): number {
  return orders.filter((o) => orderInTab(o, tab)).length
}

interface Shortage {
  productId: string
  name: string
  required: number
  available: number
}

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number }

function OrdersContentSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-card">
            <div className="shimmer h-3 w-20 rounded mb-2" />
            <div className="shimmer h-8 w-12 rounded mb-1" />
            <div className="shimmer h-3 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="shimmer h-9 w-full max-w-3xl rounded-lg" />
      <div className="glass-card overflow-hidden p-0">
        <div className="border-b bg-muted/20 px-6 py-4">
          <div className="shimmer h-3 w-24 rounded" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border/40 px-6 py-4 last:border-0">
            {[...Array(7)].map((_, j) => (
              <div key={j} className="shimmer h-4 flex-1 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { isInventory, isSales, isAdmin, loading: loadingUser } = useUser()

  useEffect(() => {
    if (pathname === "/orders") setActiveTab("all")
  }, [pathname])
  const { data: ordersRes, loading: loadingOrders, refetch } = useFetch<PaginatedResponse<SalesOrder> | SalesOrder[]>("/api/sales-orders")
  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  const [activeTab, setActiveTab] = useState<OrderTabId>("all")

  // Create order dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [lines, setLines] = useState<SalesOrderLine[]>([{ productId: "", qty: 1, unitPrice: 0 }])
  const [saving, setSaving] = useState(false)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)

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

  const tabCounts = useMemo(() => {
    const counts = {} as Record<OrderTabId, number>
    for (const tab of ORDER_TABS) counts[tab.id] = countForTab(allOrders, tab.id)
    return counts
  }, [allOrders])

  const pageReady = !loadingOrders && !loadingUser

  const contentReady = pageReady
  const resolvedTab: OrderTabId = activeTab

  function pickTab(tab: OrderTabId) {
    setActiveTab(tab)
  }

  const filteredOrders = useMemo(() => {
    if (!contentReady) return []
    return allOrders
      .filter((o) => orderInTab(o, activeTab))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [allOrders, activeTab, contentReady])

  const inProgressCount = tabCounts.in_progress
  const needsRestockCount = tabCounts.needs_restock
  const readyToShipCount = tabCounts.ready_to_ship
  const completedCount = tabCounts.completed
  const canCreateOrder = isSales
  const canDownloadInvoice = isSales || isAdmin

  async function handleDownloadInvoice(orderId: string) {
    setDownloadingInvoiceId(orderId)
    try {
      await downloadSalesOrderInvoice(orderId)
      toast.success("Invoice downloaded")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to download invoice")
    } finally {
      setDownloadingInvoiceId(null)
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
          <p className="text-sm text-muted-foreground mt-0.5">
            {contentReady ? `${allOrders.length} total orders` : "Loading orders…"}
          </p>
        </div>
        {canCreateOrder && !loadingUser && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shadow-sm shadow-primary/20">
            <Plus size={15} weight="bold" /> New Order
          </Button>
        )}
      </div>

      {!contentReady ? (
        <OrdersContentSkeleton />
      ) : (
      <>
      {/* Quick stats — click to jump to tab */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => pickTab("in_progress")}
          className={cn("stat-card text-left transition-colors hover:border-primary/30", resolvedTab === "in_progress" && "ring-1 ring-primary/30")}
        >
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Clock size={11} /> In progress
          </p>
          <p className="text-2xl font-heading font-bold">{inProgressCount}</p>
          <p className="text-[11px] text-muted-foreground">Draft through production</p>
        </button>
        <button
          type="button"
          onClick={() => pickTab("needs_restock")}
          className={cn(
            "stat-card text-left transition-colors hover:border-amber-500/40",
            needsRestockCount > 0 && "border-amber-500/30 bg-amber-500/5",
            resolvedTab === "needs_restock" && "ring-1 ring-amber-500/40"
          )}
        >
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            {needsRestockCount > 0 && <Warning size={11} className="text-amber-500" weight="fill" />}
            Needs restock
          </p>
          <p className={cn("text-2xl font-heading font-bold", needsRestockCount > 0 && "text-amber-500")}>
            {needsRestockCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Waiting on inventory</p>
        </button>
        <button
          type="button"
          onClick={() => pickTab("ready_to_ship")}
          className={cn(
            "stat-card text-left transition-colors hover:border-teal-500/40",
            readyToShipCount > 0 && "border-teal-500/30 bg-teal-500/5",
            resolvedTab === "ready_to_ship" && "ring-1 ring-teal-500/40"
          )}
        >
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <Package size={11} className="text-teal-600 dark:text-teal-400" />
            Ready to ship
          </p>
          <p className={cn("text-2xl font-heading font-bold", readyToShipCount > 0 && "text-teal-600 dark:text-teal-400")}>
            {readyToShipCount}
          </p>
          <p className="text-[11px] text-muted-foreground">Stock OK — ship next</p>
        </button>
        <button
          type="button"
          onClick={() => pickTab("completed")}
          className={cn("stat-card text-left transition-colors hover:border-emerald-500/30", resolvedTab === "completed" && "ring-1 ring-emerald-500/30")}
        >
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <CheckCircle size={11} className="text-emerald-500" />
            Completed
          </p>
          <p className="text-2xl font-heading font-bold text-emerald-500">{completedCount}</p>
          <p className="text-[11px] text-muted-foreground">Delivered & paid</p>
        </button>
      </div>

      {/* Status tabs + new order (mobile / secondary) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={resolvedTab} onValueChange={(v) => pickTab(v as OrderTabId)} className="gap-3 min-w-0 flex-1">
            <TabsList variant="line" className="w-full flex-wrap justify-start h-auto gap-0.5 pb-1">
              {ORDER_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 px-2.5 py-1.5">
                  {tab.label}
                  <span
                    className={cn(
                      "tabular-nums rounded-full px-1.5 py-0 text-[10px] font-bold min-w-5 text-center",
                      resolvedTab === tab.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        {canCreateOrder && (
          <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto shrink-0 gap-2 shadow-sm shadow-primary/20 sm:hidden">
            <Plus size={15} weight="bold" /> New Order
          </Button>
        )}
      </div>

      {/* Orders table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="table-header-row">
              <TableHead className="font-semibold text-xs">Order ID</TableHead>
              <TableHead className="font-semibold text-xs">Customer</TableHead>
              <TableHead className="font-semibold text-xs">Sales rep</TableHead>
              <TableHead className="font-semibold text-xs">Date</TableHead>
              <TableHead className="font-semibold text-xs">Items</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              <TableHead className="font-semibold text-xs text-right">Total</TableHead>
              <TableHead className="font-semibold text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-20 text-center text-muted-foreground">
                  <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">
                    {allOrders.length === 0 ? "No orders yet" : `No orders in "${ORDER_TABS.find((t) => t.id === resolvedTab)?.label}"`}
                  </p>
                  <p className="text-sm mt-1">
                    {allOrders.length === 0
                      ? "Create your first order to get started"
                      : "Try another tab or clear filters"}
                  </p>
                  {canCreateOrder && allOrders.length === 0 && (
                    <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
                      <Plus size={15} weight="bold" /> New Order
                    </Button>
                  )}
                  {allOrders.length > 0 && resolvedTab !== "all" && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        pickTab("all")
                      }}
                    >
                      View all orders
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )}
            {filteredOrders.map((order) => {
              const cust = allCustomers.find((c) => c.id === order.customerId)
              const ui = ORDER_STATUS_DISPLAY[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" }
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
                  <TableCell className="text-[12px]">
                    <div className="font-medium text-foreground">{order.salesPersonName ?? "—"}</div>
                    {order.salesPersonId && (
                      <div className="text-[10px] font-mono text-muted-foreground">{order.salesPersonId}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    <div>{formatDate(order.createdAt)}</div>
                    {order.updatedAt !== order.createdAt && (
                      <div className="text-[10px] text-muted-foreground/70">Updated {formatDate(order.updatedAt)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center group relative h-8 w-16 z-0 hover:z-50 cursor-pointer">
                      {uniqueImages.slice(0, 5).map((img, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden transition-all duration-300 ease-out shadow-sm",
                            "translate-x-(--stack-x) group-hover:translate-x-(--hover-x)"
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
                            "translate-x-(--stack-x) group-hover:translate-x-(--hover-x)"
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
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {canDownloadInvoice &&
                        INVOICE_ELIGIBLE_STATUSES.includes(
                          order.status as (typeof INVOICE_ELIGIBLE_STATUSES)[number]
                        ) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                            disabled={downloadingInvoiceId === order.id}
                            onClick={() => handleDownloadInvoice(order.id)}
                            title="Download invoice"
                          >
                            {downloadingInvoiceId === order.id ? (
                              <Spinner size={14} className="animate-spin" />
                            ) : (
                              <FileArrowDown size={14} />
                            )}
                            Invoice
                          </Button>
                        )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        {order.status === "NEEDS_RESTOCK" && isInventory ? "Restock" : "Manage"}
                        <CaretRight weight="bold" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      </>
      )}

      {/* ── Create Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ShoppingCart size={18} className="text-primary" /> New Order
            </DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-4 py-2">
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
              <div className="min-w-0 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {lines.map((line, idx) => (
                  <div key={idx} className="min-w-0 space-y-2 rounded-lg border border-border/60 p-2">
                    <select
                      value={line.productId}
                      onChange={(e) => updateLine(idx, "productId", e.target.value)}
                      className="w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                    >
                      <option value="">— Product —</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stock: {p.currentStock})
                        </option>
                      ))}
                    </select>
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="number" min={1} value={line.qty}
                        onChange={(e) => updateLine(idx, "qty", parseInt(e.target.value) || 1)}
                        className="w-16 shrink-0 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-center font-bold"
                        placeholder="Qty"
                      />
                      <span className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-muted-foreground">
                        {line.unitPrice > 0 ? formatINR(line.qty * line.unitPrice) : "—"}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
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
