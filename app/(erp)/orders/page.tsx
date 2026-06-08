"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type {
  Customer,
  Product,
  SalesOrder,
  SalesOrderLine,
  SalesOrderStatus,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  ShoppingCart,
  Spinner,
  Warning,
  Package,
  X,
  CaretRight,
  CheckCircle,
  Clock,
  FileArrowDown,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { INVOICE_ELIGIBLE_STATUSES } from "@/lib/invoice-html"
import { downloadSalesOrderInvoice } from "@/lib/download-invoice"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v)
}
function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

type OrderTabId = "in_progress" | "inventory_hold" | "ready_to_ship" | "completed"

const IN_PROGRESS_STATUSES: SalesOrderStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "INVENTORY_CHECK",
  "APPROVED",
  "IN_PRODUCTION",
  "PARTIALLY_FULFILLED",
]
const INVENTORY_HOLD_STATUSES: SalesOrderStatus[] = [
  "NEEDS_RESTOCK",
  "CREDIT_HOLD",
]
const COMPLETED_STATUSES: SalesOrderStatus[] = [
  "SHIPPED",
  "DELIVERED",
  "INVOICED",
  "PAID",
  "DISPUTED",
  "CANCELLED",
]

const TAB_STATUSES: Record<OrderTabId, SalesOrderStatus[]> = {
  in_progress: IN_PROGRESS_STATUSES,
  inventory_hold: INVENTORY_HOLD_STATUSES,
  ready_to_ship: ["READY_TO_SHIP"],
  completed: COMPLETED_STATUSES,
}

const ORDER_TABS: { id: OrderTabId; label: string }[] = [
  { id: "in_progress", label: "In Progress" },
  { id: "inventory_hold", label: "On Hold" },
  { id: "ready_to_ship", label: "Ready to Ship" },
  { id: "completed", label: "Completed" },
]

const ORDER_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "bg-muted/60 text-muted-foreground border border-border/40" },
  SUBMITTED: { label: "Submitted", color: "bg-primary/10 text-primary border border-primary/10" },
  INVENTORY_CHECK: {
    label: "Stock check",
    color: "bg-primary/10 text-primary border border-primary/10",
  },
  APPROVED: { label: "Approved", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10" },
  IN_PRODUCTION: {
    label: "In production",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10",
  },
  CREDIT_HOLD: {
    label: "Credit hold",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/10",
  },
  PARTIALLY_FULFILLED: {
    label: "Partial",
    color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10",
  },
  NEEDS_RESTOCK: {
    label: "Needs restock",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10",
  },
  READY_TO_SHIP: {
    label: "Ready to ship",
    color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/10",
  },
  SHIPPED: {
    label: "Shipped",
    color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/10",
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10",
  },
  INVOICED: { label: "Invoiced", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10" },
  PAID: { label: "Paid", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10" },
  DISPUTED: {
    label: "Disputed",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/10",
  },
  CANCELLED: {
    label: "Cancelled",
    color: "bg-destructive/10 text-destructive/90 dark:text-destructive border border-destructive/10",
  },
}

function countForTab(orders: SalesOrder[], tab: OrderTabId): number {
  return orders.filter((o) => TAB_STATUSES[tab].includes(o.status)).length
}

interface Shortage {
  productId: string
  name: string
  required: number
  available: number
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

function OrdersContentSkeleton() {
  return (
    <div className="animate-in space-y-5 duration-200 fade-in">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-card">
            <div className="shimmer mb-2 h-3 w-20 rounded" />
            <div className="shimmer mb-1 h-8 w-12 rounded" />
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
          <div
            key={i}
            className="flex gap-4 border-b border-border/40 px-6 py-4 last:border-0"
          >
            {[...Array(7)].map((_, j) => (
              <div key={j} className="shimmer h-4 flex-1 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

const PAGE_SIZE = 10

export default function OrdersPage() {
  const router = useRouter()
  const { isInventory, isSales, isAdmin, loading: loadingUser } = useUser()

  const [activeTab, setActiveTab] = useState<OrderTabId>("in_progress")
  const [page, setPage] = useState(1)

  // Summary fetch — all orders, minimal, for stat card counts
  const { data: summaryRes, refetch: refetchSummary } = useFetch<PaginatedResponse<SalesOrder>>(
    "/api/sales-orders?limit=500"
  )

  // Paginated fetch — filtered by active tab statuses
  const tabStatuses = TAB_STATUSES[activeTab].join(",")
  const { data: ordersRes, loading: loadingOrders, refetch: refetchOrders } = useFetch<PaginatedResponse<SalesOrder>>(
    `/api/sales-orders?status=${tabStatuses}&page=${page}&limit=${PAGE_SIZE}`,
    [activeTab, page]
  )

  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null)


  function unwrap<T>(res: PaginatedResponse<T> | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as PaginatedResponse<T>).data)) return (res as PaginatedResponse<T>).data
    return []
  }

  function refetch() { refetchSummary(); refetchOrders() }

  const summaryOrders = unwrap(summaryRes)
  const pageOrders = unwrap(ordersRes)
  const allCustomers = unwrap(customersRes)
  const allProducts = unwrap(productsRes)

  const totalCount = (ordersRes as PaginatedResponse<SalesOrder> | null)?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const tabCounts = useMemo(() => ({
    in_progress: countForTab(summaryOrders, "in_progress"),
    inventory_hold: countForTab(summaryOrders, "inventory_hold"),
    ready_to_ship: countForTab(summaryOrders, "ready_to_ship"),
    completed: countForTab(summaryOrders, "completed"),
  }), [summaryOrders])

  function switchTab(tab: OrderTabId) {
    setActiveTab(tab)
    setPage(1)
  }

  const contentReady = !loadingOrders && !loadingUser
  const canCreateOrder = isSales || isAdmin
  const canDownloadInvoice = isSales || isAdmin

  async function handleDownloadInvoice(orderId: string) {
    setDownloadingInvoiceId(orderId)
    try {
      await downloadSalesOrderInvoice(orderId)
      toast.success("Invoice downloaded")
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to download invoice"
      )
    } finally {
      setDownloadingInvoiceId(null)
    }
  }



  return (
    <div className="mx-auto w-full space-y-4 p-4 sm:p-6 sm:px-8 lg:px-10">
      <title>Orders | ShirtCo ERP</title>

      {/* Header */}
      <div className="page-header">
        <div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {contentReady
              ? `${totalCount} orders`
              : "Loading orders…"}
          </p>
        </div>
        {canCreateOrder && !loadingUser && (
          <Button
            onClick={() => router.push("/orders/new")}
            className="gap-2 shadow-sm shadow-primary/20"
          >
            <Plus size={15} weight="bold" /> New Order
          </Button>
        )}
      </div>

      {!contentReady ? (
        <OrdersContentSkeleton />
      ) : (
        <>
          {/* Stat cards — read-only overview */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="stat-card">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Clock size={11} /> In Progress
              </p>
              <p className="font-heading text-2xl font-bold">{tabCounts.in_progress}</p>
              <p className="text-[11px] text-muted-foreground">Draft through production</p>
            </div>

            <button
              type="button"
              onClick={() => switchTab("inventory_hold")}
              className={cn(
                "stat-card text-left transition-all hover:border-amber-500/40",
                tabCounts.inventory_hold > 0 && "border-amber-500/30 bg-amber-500/5",
                activeTab === "inventory_hold" && "ring-2 ring-amber-500/40"
              )}
            >
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                {tabCounts.inventory_hold > 0 && <Warning size={11} className="text-amber-500" weight="fill" />}
                On Hold
              </p>
              <p className={cn("font-heading text-2xl font-bold", tabCounts.inventory_hold > 0 && "text-amber-500")}>
                {tabCounts.inventory_hold}
              </p>
              <p className="text-[11px] text-muted-foreground">Restock &amp; credit holds</p>
            </button>

            <div className={cn("stat-card", tabCounts.ready_to_ship > 0 && "border-teal-500/30 bg-teal-500/5")}>
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Package size={11} className="text-teal-600 dark:text-teal-400" />
                Ready to Ship
              </p>
              <p className={cn("font-heading text-2xl font-bold", tabCounts.ready_to_ship > 0 && "text-teal-600 dark:text-teal-400")}>
                {tabCounts.ready_to_ship}
              </p>
              <p className="text-[11px] text-muted-foreground">Stock OK — ship next</p>
            </div>

            <div className="stat-card">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CheckCircle size={11} className="text-emerald-500" />
                Completed
              </p>
              <p className="font-heading text-2xl font-bold text-emerald-500">{tabCounts.completed}</p>
              <p className="text-[11px] text-muted-foreground">Shipped, paid &amp; closed</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="overflow-x-auto border-b">
            <div className="flex min-w-max items-center gap-1">
              {ORDER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                    activeTab === tab.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                    tab.id === "inventory_hold" && tabCounts.inventory_hold > 0 && activeTab !== tab.id && "bg-amber-500/15 text-amber-600"
                  )}>
                    {tabCounts[tab.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Orders — card list on mobile, table on md+ */}

          {/* Empty state */}
          {pageOrders.length === 0 && (
            <div className="glass-card py-20 text-center text-muted-foreground">
              <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">
                {summaryOrders.length === 0 ? "No orders yet" : "No orders in this stage yet"}
              </p>
              <p className="mt-1 text-sm">
                {summaryOrders.length === 0 ? "Create your first order to get started" : "Try another tab"}
              </p>
              {canCreateOrder && summaryOrders.length === 0 && (
                <Button className="mt-4 gap-2" onClick={() => router.push("/orders/new")}>
                  <Plus size={15} weight="bold" /> New Order
                </Button>
              )}
              {summaryOrders.length > 0 && activeTab !== "in_progress" && tabCounts.in_progress > 0 && (
                <Button variant="link" size="sm" className="mt-2" onClick={() => switchTab("in_progress")}>
                  View in-progress orders
                </Button>
              )}
            </div>
          )}

          {/* Mobile cards */}
          {pageOrders.length > 0 && (
            <div className="md:hidden space-y-2">
              {pageOrders.map((order) => {
                const cust = allCustomers.find((c) => c.id === order.customerId)
                const ui = ORDER_STATUS_DISPLAY[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" }
                const total = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                return (
                  <div
                    key={order.id}
                    className="glass-card cursor-pointer p-4 transition-colors hover:bg-muted/30"
                    onClick={() => router.push(`/orders/${order.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-primary">{order.id}</p>
                        <p className="mt-0.5 text-sm font-medium">{cust?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className={`badge-status ${ui.color}`}>{ui.label}</span>
                        <p className="text-sm font-bold">{formatINR(total)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs text-muted-foreground">{order.salesPersonName ?? "—"}</p>
                      <div className="flex items-center gap-1">
                        {canDownloadInvoice && INVOICE_ELIGIBLE_STATUSES.includes(order.status as (typeof INVOICE_ELIGIBLE_STATUSES)[number]) && (
                          <Button
                            variant="default" size="sm"
                            className="h-7 gap-1 px-2 text-xs bg-emerald-600 text-white hover:bg-emerald-700 font-medium shadow-sm"
                            disabled={downloadingInvoiceId === order.id}
                            onClick={() => handleDownloadInvoice(order.id)}
                          >
                            {downloadingInvoiceId === order.id ? <Spinner size={13} className="animate-spin" /> : <FileArrowDown size={13} />}
                            Invoice
                          </Button>
                        )}
                        <Button
                          variant="outline" size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          {order.status === "NEEDS_RESTOCK" && isInventory ? "Restock" : "Manage"}
                          <CaretRight size={12} weight="bold" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Desktop table */}
          {pageOrders.length > 0 && (
            <div className="glass-card hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="table-header-row">
                    <TableHead className="text-xs font-semibold">Order ID</TableHead>
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="hidden text-xs font-semibold lg:table-cell">Sales rep</TableHead>
                    <TableHead className="hidden text-xs font-semibold sm:table-cell">Date</TableHead>
                    <TableHead className="hidden text-xs font-semibold lg:table-cell">Items</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Total</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageOrders.map((order) => {
                    const cust = allCustomers.find((c) => c.id === order.customerId)
                    const ui = ORDER_STATUS_DISPLAY[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" }
                    const total = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                    const images = order.lines.map((l) => l.imageUrl).filter(Boolean) as string[]
                    const uniqueImages = Array.from(new Set(images))

                    return (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer transition-colors hover:bg-muted/30"
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-primary">{order.id}</TableCell>
                        <TableCell className="text-[13px] font-medium">{cust?.name ?? "—"}</TableCell>
                        <TableCell className="hidden text-[12px] lg:table-cell">
                          <div className="font-medium text-foreground">{order.salesPersonName ?? "—"}</div>
                          {order.salesPersonId && (
                            <div className="font-mono text-[10px] text-muted-foreground">{order.salesPersonId}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-[12px] text-muted-foreground sm:table-cell">
                          <div>{formatDate(order.createdAt)}</div>
                          {order.updatedAt !== order.createdAt && (
                            <div className="text-[10px] text-muted-foreground/70">Upd. {formatDate(order.updatedAt)}</div>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="group relative z-0 flex h-8 w-16 cursor-pointer items-center hover:z-50">
                            {uniqueImages.slice(0, 5).map((img, idx) => (
                              <div
                                key={idx}
                                className={cn(
                                  "absolute top-0 left-0 h-8 w-8 overflow-hidden rounded-full border border-border/30 bg-muted transition-all duration-300 ease-out",
                                  "translate-x-(--stack-x) group-hover:translate-x-(--hover-x)"
                                )}
                                style={{ zIndex: 50 - idx, "--stack-x": `${idx * 5}px`, "--hover-x": `${idx * 24}px` } as React.CSSProperties}
                              >
                                <img src={img} alt="Product" className="h-full w-full object-cover" />
                              </div>
                            ))}
                            {uniqueImages.length > 5 && (
                              <div
                                className={cn(
                                  "absolute top-0 left-0 flex h-8 w-8 items-center justify-center rounded-full border border-border/30 bg-muted text-[10px] font-bold transition-all duration-300 ease-out",
                                  "translate-x-(--stack-x) group-hover:translate-x-(--hover-x)"
                                )}
                                style={{ zIndex: 40, "--stack-x": `${5 * 5}px`, "--hover-x": `${5 * 24}px` } as React.CSSProperties}
                              >
                                +{uniqueImages.length - 5}
                              </div>
                            )}
                            {uniqueImages.length === 0 && (
                              <span className="px-2 text-xs italic text-muted-foreground/50">No images</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`badge-status ${ui.color}`}>{ui.label}</span>
                        </TableCell>
                        <TableCell className="text-right text-[13px] font-bold">{formatINR(total)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canDownloadInvoice && INVOICE_ELIGIBLE_STATUSES.includes(order.status as (typeof INVOICE_ELIGIBLE_STATUSES)[number]) && (
                               <Button
                                 variant="default" size="sm"
                                 className="h-8 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors shadow-sm"
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
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="text-xs text-muted-foreground">
                {totalCount} orders · page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…")
                    acc.push(p)
                    return acc
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

