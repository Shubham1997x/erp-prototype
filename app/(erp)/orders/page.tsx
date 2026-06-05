"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type { Customer, Product, SalesOrder, SalesOrderLine, SalesOrderStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus, ShoppingCart, Spinner, Package, X, CaretRight, CheckCircle, Clock, FileArrowDown, MagnifyingGlass, CaretLeft
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

type OrderTabId = "action_required" | "in_progress" | "completed" | "cancelled"

const STATUS_GROUPS: Record<OrderTabId, SalesOrderStatus[] | null> = {
  action_required: ["NEEDS_RESTOCK", "READY_TO_SHIP"],
  in_progress: ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION", "CREDIT_HOLD", "PARTIALLY_FULFILLED", "SHIPPED"],
  completed: ["DELIVERED", "INVOICED", "PAID", "DISPUTED"],
  cancelled: ["CANCELLED"],
}

const ORDER_TABS: { id: OrderTabId; label: string; icon: React.ElementType }[] = [
  { id: "action_required", label: "Action Required", icon: Package },
  { id: "in_progress", label: "In Progress", icon: Clock },
  { id: "completed", label: "Completed", icon: CheckCircle },
  { id: "cancelled", label: "Cancelled", icon: X },
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

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number }

function OrdersContentSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
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
  const searchParams = useSearchParams()

  const { isInventory, isSales, isAdmin, loading: loadingUser } = useUser()

  const page = parseInt(searchParams.get("page") ?? "1", 10)
  const tabParam = (searchParams.get("tab") ?? "action_required") as OrderTabId
  const qParam = searchParams.get("q") ?? ""

  const resolvedTab = ORDER_TABS.some(t => t.id === tabParam) ? tabParam : "action_required"
  const statuses = STATUS_GROUPS[resolvedTab]

  // Local state for search debouncing
  const [searchInput, setSearchInput] = useState(qParam)

  // Debounce search input to update URL query params
  useEffect(() => {
    if (searchInput === qParam) return

    const handler = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchInput.trim()) {
        params.set("q", searchInput.trim())
      } else {
        params.delete("q")
      }
      params.set("page", "1") // Reset to page 1 on new search
      router.push(`${pathname}?${params.toString()}`)
    }, 400)
    return () => clearTimeout(handler)
  }, [searchInput, qParam, pathname, router, searchParams])

  // Fetch paginated & filtered data from API
  const statusQuery = statuses ? statuses.join(",") : ""
  const url = `/api/sales-orders?page=${page}&limit=12${statusQuery ? `&status=${statusQuery}` : ""}${qParam ? `&q=${encodeURIComponent(qParam)}` : ""}`

  const { data: ordersRes, loading: loadingOrders, refetch } = useFetch<PaginatedResponse<SalesOrder>>(url, [url])
  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")
  const { data: countsRes } = useFetch<Record<string, number>>("/api/sales-orders/counts")

  // Create order dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [lines, setLines] = useState<SalesOrderLine[]>([{ productId: "", qty: 1, unitPrice: 0 }])
  const [saving, setSaving] = useState(false)
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)

  function unwrap<T>(res: PaginatedResponse<T> | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as PaginatedResponse<T>).data)) return (res as PaginatedResponse<T>).data
    return []
  }

  const allCustomers = unwrap(customersRes)
  const allProducts = unwrap(productsRes)

  const ordersData = ordersRes && !Array.isArray(ordersRes) ? (ordersRes as PaginatedResponse<SalesOrder>) : { data: [], total: 0, page: 1, limit: 20 }
  const filteredOrders = ordersData.data
  const totalPages = Math.ceil(ordersData.total / ordersData.limit)

  const pageReady = !loadingUser
  const canCreateOrder = isSales
  const canDownloadInvoice = isSales || isAdmin

  function pickTab(tab: OrderTabId) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    params.set("page", "1")
    router.push(`${pathname}?${params.toString()}`)
  }

  function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > totalPages) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", newPage.toString())
    router.push(`${pathname}?${params.toString()}`)
  }

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
      pickTab("in_progress")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 lg:px-10 w-full mx-auto">
      <title>Orders | ShirtCo ERP</title>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold font-heading">Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your sales workflows and fulfillments
          </p>
        </div>
        {canCreateOrder && !loadingUser && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shadow-sm shadow-primary/20">
            <Plus size={15} weight="bold" /> New Order
          </Button>
        )}
      </div>

      {!pageReady ? (
        <OrdersContentSkeleton />
      ) : (
        <>
          {/* Top Controls: Search & Tabs */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full max-w-sm">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by ID, customer, notes..."
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            <Tabs value={resolvedTab} onValueChange={(v) => pickTab(v as OrderTabId)} className="w-full md:w-auto overflow-x-auto min-w-0 pb-1">
              <TabsList className="bg-muted/50 p-1">
                {ORDER_TABS.map((tab) => {
                  const Icon = tab.icon
                  let count = 0
                  if (countsRes) {
                    const groupStatuses = STATUS_GROUPS[tab.id]
                    if (groupStatuses) {
                      count = groupStatuses.reduce((acc, status) => acc + (countsRes[status] || 0), 0)
                    } else {
                      count = Object.values(countsRes).reduce((acc, val) => acc + val, 0)
                    }
                  }
                  
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className="gap-2 px-3 py-1.5 text-xs">
                      <Icon size={14} className={resolvedTab === tab.id ? "text-primary" : "text-muted-foreground"} />
                      {tab.label}
                      {count > 0 && (
                        <span className="ml-1 flex h-4 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[9px] font-bold text-primary">
                          {count}
                        </span>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </Tabs>
          </div>

          {/* Orders table */}
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="table-header-row bg-muted/20">
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
                {loadingOrders && filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-20 text-center text-muted-foreground">
                      <Spinner size={24} className="animate-spin mx-auto opacity-50" />
                    </TableCell>
                  </TableRow>
                )}
                {!loadingOrders && filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-20 text-center text-muted-foreground">
                      <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
                      <p className="font-medium">
                        {ordersData.total === 0 && !qParam ? "No orders found" : "No results match your search"}
                      </p>
                      <p className="text-sm mt-1">
                        {qParam ? "Try adjusting your search or clear filters" : "Create your first order to get started"}
                      </p>
                      {qParam && (
                        <Button variant="link" size="sm" className="mt-2" onClick={() => { setSearchInput(""); pickTab("action_required"); }}>
                          Clear search
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.map((order) => {
                  const cust = allCustomers.find((c) => c.id === order.customerId)
                  const ui = ORDER_STATUS_DISPLAY[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" }
                  const total = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)

                  const images = order.lines.map(l => l.imageUrl).filter(Boolean) as string[]
                  const uniqueImages = Array.from(new Set(images))

                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => router.push(`/orders/${order.id}`)}
                    >
                      <TableCell>
                        <div className="font-mono text-xs font-semibold text-primary">{order.orderNumber || order.id}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate max-w-[100px]">{order.id}</div>
                      </TableCell>
                      <TableCell className="font-medium text-[13px]">{cust?.name ?? "—"}</TableCell>
                      <TableCell className="text-[12px]">
                        <div className="font-medium text-foreground">{order.salesPersonName ?? "—"}</div>
                        {order.salesPersonId && order.salesPersonName && (
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
                        <div className="flex items-center gap-3">
                          <div className="flex items-center group relative h-8 w-16 z-0 hover:z-50 cursor-pointer">
                            {uniqueImages.slice(0, 5).map((img, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  "absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-background bg-muted overflow-hidden transition-all duration-300 ease-out shadow-sm",
                                  "translate-x-[var(--stack-x)] group-hover:translate-x-[var(--hover-x)]"
                                )}
                                style={{ zIndex: 50 - idx, "--stack-x": `${idx * 5}px`, "--hover-x": `${idx * 24}px` } as React.CSSProperties}
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
                                style={{ zIndex: 40, "--stack-x": `${5 * 5}px`, "--hover-x": `${5 * 24}px` } as React.CSSProperties}
                              >
                                +{uniqueImages.length - 5}
                              </div>
                            )}
                            {uniqueImages.length === 0 && (
                              <span className="text-xs text-muted-foreground/50 italic px-2">No images</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">{order.lines.length} items</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`badge-status ${ui.color}`}>{ui.label}</span>
                      </TableCell>
                      <TableCell className="font-bold text-[13px] text-right">{formatINR(total)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canDownloadInvoice && INVOICE_ELIGIBLE_STATUSES.includes(order.status as (typeof INVOICE_ELIGIBLE_STATUSES)[number]) && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                              disabled={downloadingInvoiceId === order.id}
                              onClick={() => handleDownloadInvoice(order.id)}
                              title="Download invoice"
                            >
                              {downloadingInvoiceId === order.id ? <Spinner size={14} className="animate-spin" /> : <FileArrowDown size={14} />}
                              Invoice
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm"
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

            {/* Pagination Footer */}
            {totalPages > 1 && (
              <div className="border-t px-6 py-4 flex items-center justify-between bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-bold text-foreground">{filteredOrders.length}</span> of <span className="font-bold text-foreground">{ordersData.total}</span> orders
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="h-8 gap-1"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                  >
                    <CaretLeft size={14} /> Previous
                  </Button>
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline" size="sm"
                    className="h-8 gap-1"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next <CaretRight size={14} />
                  </Button>
                </div>
              </div>
            )}
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
