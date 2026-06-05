"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import {
  NOTIFICATIONS_CHANGED_EVENT,
  notifyNotificationsChanged,
} from "@/components/providers/notification-provider"
import { useUser } from "@/hooks/use-user"
import type { Customer, Product, SalesOrder, SalesOrderLine, SalesOrderStatus } from "@/lib/types"
import { canEditOrder } from "@/lib/order-edit"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { EditOrderDialog } from "@/components/erp/edit-order-dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ArrowLeft, CheckCircle, Warning, Package, CaretRight, Spinner, Check, XCircle, BellRinging, Truck, FileArrowDown,
  PencilSimple, Plus, X, ShoppingCart,
  UserCircle,
  FileText
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
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

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

const CANCELLABLE: SalesOrderStatus[] = [
  "DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION",
  "CREDIT_HOLD", "NEEDS_RESTOCK", "READY_TO_SHIP", "PARTIALLY_FULFILLED",
]

interface Shortage {
  productId: string
  name: string
  required: number
  available: number
}

interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number }

export default function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = use(params)

  const { isSales, isInventory, isAdmin, loading: loadingUser } = useUser()

  const { data: order, loading: loadingOrder, refetch } = useFetch<SalesOrder>(`/api/sales-orders/${id}`)
  const { data: customersRes } = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const { data: productsRes } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  function unwrap<T>(res: PaginatedResponse<T> | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as PaginatedResponse<T>).data)) return (res as PaginatedResponse<T>).data
    return []
  }

  const allCustomers = unwrap(customersRes)
  const allProducts = unwrap(productsRes)

  // Actions
  const [checking, setChecking] = useState(false)

  // Restock Dialog
  const [restockDialog, setRestockDialog] = useState<Shortage[] | null>(null)
  const [restockForm, setRestockForm] = useState<Record<string, { qty: number; invoiceDetails: string }>>({})
  const [restocking, setRestocking] = useState(false)

  // Cancel Dialog
  const [cancelDialog, setCancelDialog] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Ship Dialog
  const [shipDialog, setShipDialog] = useState(false)
  const [shipForm, setShipForm] = useState({ carrier: "", trackingNumber: "" })
  const [shipping, setShipping] = useState(false)
  const [markingDelivered, setMarkingDelivered] = useState(false)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)
  const [nudging, setNudging] = useState(false)

  // Edit order
  const [editOpen, setEditOpen] = useState(false)

  // Keep order + notifications fresh for sales while waiting on inventory (no manual reload)
  useEffect(() => {
    if (loadingUser || !order || (!isSales && !isAdmin)) return
    if (order.status !== "NEEDS_RESTOCK") return

    const interval = setInterval(() => void refetch(), 15_000)

    return () => clearInterval(interval)
  }, [loadingUser, order, isSales, isAdmin, refetch])

  useEffect(() => {
    if (!order?.id) return
    const onUpdate = () => void refetch()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onUpdate)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onUpdate)
  }, [order?.id, refetch])

  if (loadingOrder) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
        <Spinner size={24} className="animate-spin mb-4" />
        <p>Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="p-12 text-center text-destructive">
        <h2 className="text-xl font-bold">Order not found</h2>
        <Button variant="ghost" onClick={() => router.push("/orders")} className="mt-4">
          <ArrowLeft className="mr-2" /> Back to Orders
        </Button>
      </div>
    )
  }

  const cust = allCustomers.find((c) => c.id === order.customerId)
  const statusUi = ORDER_STATUS_DISPLAY[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" }
  const total = order.lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0)
  const actionsReady = !loadingUser

  // Calculate current shortages dynamically to handle cases where stock became available after status was set
  const aggregatedQty: Record<string, number> = {}
  if (order.status === "NEEDS_RESTOCK") {
    for (const l of order.lines) {
      aggregatedQty[l.productId] = (aggregatedQty[l.productId] || 0) + l.qty
    }
  }
  const currentShortages = order.status === "NEEDS_RESTOCK"
    ? Object.entries(aggregatedQty)
      .map(([productId, required]) => {
        const p = allProducts.find((p) => p.id === productId)
        return { name: p?.name ?? productId, required, available: p?.currentStock ?? 0, sku: p?.sku, image: p?.imageUrl, productId }
      })
      .filter((s) => s.available < s.required)
    : []
  const hasShortages = currentShortages.length > 0

  const canCheck = isSales && ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION", "PARTIALLY_FULFILLED", "CREDIT_HOLD"].includes(order.status)
  const checkStockLabel =
    order.status === "APPROVED" || order.status === "IN_PRODUCTION" || order.status === "PARTIALLY_FULFILLED"
      ? "Verify & Mark Ready to Ship"
      : "Check Stock & Reserve"
  const canRestock = isInventory && order.status === "NEEDS_RESTOCK" && hasShortages
  const canFulfillDirectly = isInventory && order.status === "NEEDS_RESTOCK" && !hasShortages
  const canShip = isSales && order.status === "READY_TO_SHIP"
  const canMarkDelivered = isSales && order.status === "SHIPPED"
  const canCancel = isSales && CANCELLABLE.includes(order.status)
  const canEdit = (isSales || isAdmin) && canEditOrder(order.status)
  const canDownloadInvoice =
    (isSales || isAdmin) &&
    INVOICE_ELIGIBLE_STATUSES.includes(order.status as (typeof INVOICE_ELIGIBLE_STATUSES)[number])
  const hasHeaderActions =
    canCheck || canRestock || canFulfillDirectly || canShip || canMarkDelivered || canCancel || canDownloadInvoice || canEdit

  async function handleCheckStock() {
    if (!order) return
    setChecking(true)
    try {
      const id = order.id
      let status = order.status

      if (status === "DRAFT") {
        await apiPatch(`/api/sales-orders/${id}/status`, { status: "SUBMITTED" })
        status = "SUBMITTED"
      }
      if (status === "SUBMITTED") {
        await apiPatch(`/api/sales-orders/${id}/status`, { status: "INVENTORY_CHECK" })
        status = "INVENTORY_CHECK"
      }
      if (status === "INVENTORY_CHECK") {
        const result = await apiPatch<{ status: string; shortages?: Shortage[] }>(
          `/api/sales-orders/${id}/status`,
          { status: "APPROVED" }
        )
        if (result.status === "NEEDS_RESTOCK") {
          toast.warning("Insufficient stock — order flagged for restock")
        } else {
          toast.success("Stock checked and reserved — order approved")
        }
        await refetch()
        return
      }
      if (status === "APPROVED" || status === "IN_PRODUCTION") {
        await apiPatch(`/api/sales-orders/${id}/status`, { status: "READY_TO_SHIP" })
        toast.success("Stock verified — order ready to ship")
        await refetch()
        return
      }

      toast.error("Cannot check stock from this status")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Stock check failed")
    } finally {
      setChecking(false)
    }
  }

  async function handleRestock() {
    if (!restockDialog) return
    setRestocking(true)
    try {
      for (const [prodId, data] of Object.entries(restockForm)) {
        if (data.qty > 0) {
          const stockResult = await apiPost<{ ok: boolean; autoFulfilledOrders?: string[] }>("/api/stock", {
            entityType: "product",
            entityId: prodId,
            delta: data.qty,
            reason: `Restock for order ${order!.id}${data.invoiceDetails ? ` - Invoice: ${data.invoiceDetails}` : ""}`,
          })
          if (stockResult.autoFulfilledOrders?.length) {
            notifyNotificationsChanged()
          }
        }
      }
      const result = await apiPost<{ status: string; shortages?: Shortage[] }>(
        `/api/sales-orders/${order!.id}/fulfill`,
        {}
      )
      setRestockDialog(null)
      await refetch()
      if (result.status === "NEEDS_RESTOCK") {
        toast.warning("Stock added, but the order still has shortages")
      } else {
        toast.success("Restock applied — order is ready to ship")
      }
      notifyNotificationsChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Restock failed")
    } finally {
      setRestocking(false)
    }
  }

  async function handleFulfillOrder() {
    setRestocking(true)
    try {
      const result = await apiPost<{ status: string; shortages?: Shortage[] }>(
        `/api/sales-orders/${order!.id}/fulfill`,
        {}
      )
      await refetch()
      if (result.status === "NEEDS_RESTOCK") {
        toast.warning("Failed to fulfill — order still has shortages")
      } else {
        toast.success("Order fulfilled and is ready to ship")
      }
      notifyNotificationsChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Fulfillment failed")
    } finally {
      setRestocking(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      await apiPost(`/api/sales-orders/${order!.id}/cancel`, {})
      toast.success("Order cancelled")
      setCancelDialog(false)
      await refetch()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setCancelling(false)
    }
  }

  async function handleShip() {
    setShipping(true)
    try {
      await apiPost(`/api/sales-orders/${order!.id}/ship`, shipForm)
      toast.success("Order shipped")
      setShipDialog(false)
      await refetch()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to ship order")
    } finally {
      setShipping(false)
    }
  }

  async function handleMarkDelivered() {
    setMarkingDelivered(true)
    try {
      await apiPatch(`/api/sales-orders/${order!.id}/status`, { status: "DELIVERED" })
      toast.success("Order marked as delivered")
      await refetch()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update order")
    } finally {
      setMarkingDelivered(false)
    }
  }

  async function handleNudgeInventory() {
    setNudging(true)
    try {
      await apiPost(`/api/sales-orders/${order!.id}/nudge`, {})
      toast.success("Nudge sent to inventory team")
      notifyNotificationsChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send nudge")
    } finally {
      setNudging(false)
    }
  }

  async function handleDownloadInvoice() {
    setDownloadingInvoice(true)
    try {
      await downloadSalesOrderInvoice(order!.id)
      toast.success("Invoice downloaded")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to download invoice")
    } finally {
      setDownloadingInvoice(false)
    }
  }

  function openEditDialog() {
    setEditOpen(true)
  }

  function openRestockDialog() {
    const shortages: Shortage[] = order!.lines
      .map((l) => {
        const p = allProducts.find((p) => p.id === l.productId)
        return { productId: l.productId, name: p?.name ?? l.productId, required: l.qty, available: p?.currentStock ?? 0 }
      })
      .filter((s) => s.available < s.required)
    const form: Record<string, { qty: number; invoiceDetails: string }> = {}
    for (const s of shortages) {
      form[s.productId] = { qty: Math.max(0, s.required - s.available), invoiceDetails: "" }
    }
    setRestockForm(form)
    setRestockDialog(shortages.length > 0 ? shortages : order!.lines.map((l) => {
      const p = allProducts.find((x) => x.id === l.productId)
      return { productId: l.productId, name: p?.name ?? l.productId, required: l.qty, available: p?.currentStock ?? 0 }
    }))
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 lg:px-10 w-full mx-auto">
      <title>{order.id} | ShirtCo ERP</title>

      {/* Header & Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <button onClick={() => router.push("/orders")} className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft size={14} /> Orders
          </button>
          <CaretRight size={12} />
          <span className="font-mono">{order.orderNumber || order.id}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-mono break-all">{order.orderNumber || order.id}</h1>
            <span className={cn("px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-semibold tracking-wide shrink-0", statusUi.color)}>
              {statusUi.label}
            </span>
          </div>
          <div className="text-sm text-muted-foreground font-mono truncate max-w-full -mt-2">
            ID: {order.id}
          </div>

          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
            {!actionsReady ? (
              <>
                <div className="shimmer h-9 w-36 rounded-md" />
                <div className="shimmer h-9 w-28 rounded-md" />
              </>
            ) : (
              <>
                {canEdit && (
                  <Button variant="outline" onClick={openEditDialog} className="gap-2">
                    <PencilSimple size={16} /> Edit Order
                  </Button>
                )}
                {canCheck && (
                  <Button onClick={handleCheckStock} disabled={checking} className="gap-2 bg-primary/90 hover:bg-primary shadow-sm">
                    {checking ? <Spinner size={16} className="animate-spin" /> : <Check size={16} weight="bold" />}
                    {checkStockLabel}
                  </Button>
                )}
                {canRestock && (
                  <Button onClick={openRestockDialog} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-sm">
                    <Package size={16} /> Fulfill Restock
                  </Button>
                )}
                {canFulfillDirectly && (
                  <Button onClick={handleFulfillOrder} disabled={restocking} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                    {restocking ? <Spinner size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    Fulfill Order
                  </Button>
                )}
                {canShip && (
                  <Button
                    onClick={() => { setShipForm({ carrier: "", trackingNumber: "" }); setShipDialog(true) }}
                    className="gap-2 bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                  >
                    <Truck size={16} /> Ship Order
                  </Button>
                )}
                {canMarkDelivered && (
                  <Button
                    onClick={handleMarkDelivered}
                    disabled={markingDelivered}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                  >
                    {markingDelivered ? <Spinner size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    Mark Delivered
                  </Button>
                )}
                {canCancel && (
                  <Button variant="outline" onClick={() => setCancelDialog(true)} className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive">
                    <XCircle size={16} /> Cancel Order
                  </Button>
                )}
                {canDownloadInvoice && (
                  <Button
                    variant="outline"
                    onClick={handleDownloadInvoice}
                    disabled={downloadingInvoice}
                    className="gap-2"
                  >
                    {downloadingInvoice ? (
                      <Spinner size={16} className="animate-spin" />
                    ) : (
                      <FileArrowDown size={16} />
                    )}
                    Download Invoice
                  </Button>
                )}
                {!hasHeaderActions && (
                  <span className="text-xs text-muted-foreground px-2">No actions for this status</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

            {/* Banner Actions */}
      <div className="space-y-4 mb-6">
        {(order.status === "NEEDS_RESTOCK") && (() => {
          if (!hasShortages) {
            return (
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 dark:border-teal-500/30 dark:bg-teal-500/5 shadow-sm overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-400 to-emerald-500" />

                <div className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle size={20} className="text-teal-600 dark:text-teal-500" weight="duotone" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-base">Stock Available</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Inventory has sufficient stock for this order. {isInventory ? "Fulfill it to proceed to shipping." : "Please notify the inventory team to fulfill it."}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-teal-200/60 dark:border-teal-500/20 flex gap-2">
                    {isInventory ? (
                      <Button
                        size="sm"
                        disabled={restocking}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={handleFulfillOrder}
                      >
                        {restocking ? (
                          <Spinner size={14} className="mr-2 animate-spin" />
                        ) : (
                          <CheckCircle size={14} className="mr-2" />
                        )}
                        Fulfill Order
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={nudging}
                        className="w-full bg-white hover:bg-teal-50 text-teal-700 border-teal-200 dark:bg-transparent dark:hover:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/30"
                        onClick={handleNudgeInventory}
                      >
                        {nudging ? (
                          <Spinner size={14} className="mr-2 animate-spin" />
                        ) : (
                          <BellRinging size={14} className="mr-2" />
                        )}
                        Nudge Inventory
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div className="glass-card overflow-hidden relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500" />

              <div className="p-6">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                    <Warning size={24} className="text-amber-600 dark:text-amber-500" weight="duotone" />
                  </div>
                  <div className="pt-0.5">
                    <h3 className="font-bold text-foreground text-lg">Fulfillment Blocked</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Order is awaiting inventory restock.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-amber-800 dark:text-amber-400">Missing Items</h4>
                  <div className="space-y-3">
                    {currentShortages.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-muted/20 hover:bg-muted/30 transition-colors p-3 rounded-xl border border-border/60 shadow-sm">
                        {s.image ? (
                          <img src={s.image} alt={s.name} className="w-8 h-8 rounded object-cover shrink-0 border" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package size={14} className="text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-semibold truncate text-foreground leading-tight mb-1">{s.name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{s.sku}</div>
                        </div>
                        <div className="text-right shrink-0 pr-2">
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-500 mb-0.5">Need {s.required - s.available}</div>
                          <div className="text-[11px] text-muted-foreground font-medium">Have {s.available}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-amber-200/60 dark:border-amber-500/20 flex gap-2">
                  {isInventory ? (
                    <Button
                      size="sm"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={openRestockDialog}
                    >
                      <Package size={14} className="mr-2" />
                      Restock Items
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={nudging}
                      className="w-full bg-white hover:bg-amber-50 text-amber-700 border-amber-200 dark:bg-transparent dark:hover:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
                      onClick={handleNudgeInventory}
                    >
                      {nudging ? (
                        <Spinner size={14} className="mr-2 animate-spin" />
                      ) : (
                        <BellRinging size={14} className="mr-2" />
                      )}
                      Nudge Inventory
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Customer Details */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <UserCircle size={14} weight="bold" /> Customer Details
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Name</div>
              <div className="text-sm font-semibold">{cust?.name || "Unknown"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Email</div>
              <div className="text-sm font-medium">{cust?.email || "—"}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Address</div>
              <div className="text-sm font-medium">{cust?.address || "—"}</div>
            </div>
          </div>
        </div>

        {/* Logistics Details */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
            <Truck weight="bold" size={14} /> Logistics Details
          </h3>
          <div className="space-y-4">
            {(order.tracking_number || order.carrier || order.status === "SHIPPED") ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-0.5">Carrier</div>
                  <div className="text-sm font-medium">{order.carrier || "Not specified"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-0.5">Tracking Number</div>
                  <div className="text-sm font-mono font-bold text-foreground">{order.tracking_number || "Pending"}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground border border-border/50 flex items-center gap-3">
                <div className="bg-background rounded-full p-1.5 shadow-sm border"><Package size={16} /></div>
                <div>
                  <div className="font-semibold text-foreground">Pending Shipping</div>
                  <div className="text-xs">Order has not been dispatched yet.</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">Requested Date</div>
                <div className="text-sm font-medium">{formatDate(order.requestedDeliveryDate)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">Estimated Ship Date</div>
                <div className="text-sm font-medium">{order.promisedDeliveryDate ? formatDate(order.promisedDeliveryDate) : "—"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Metadata */}
        <div className="glass-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
             <FileText weight="bold" size={14} /> Order Metadata
          </h3>
          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Created At</div>
              <div className="text-sm font-medium">{formatDate(order.createdAt)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Last Updated</div>
              <div className="text-sm font-medium">{formatDate(order.updatedAt)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground mb-0.5">Sales rep</div>
              <div className="text-sm font-medium">{order.salesPersonName ?? order.createdBy ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b bg-muted/5 flex items-center gap-2">
          <ShoppingCart size={16} weight="bold" className="text-muted-foreground" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Line Items</h3>
        </div>
        <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Item Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((l, i) => {
                  const p = allProducts.find((p) => p.id === l.productId)
                  const lineSubtotal = l.qty * l.unitPrice
                  // Mock tax calculation for UI demonstration (e.g., 0% for now)
                  const lineTax = 0
                  const isOutOfStock = p && p.currentStock < l.qty

                  return (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-md border bg-muted/30 flex items-center justify-center shrink-0 overflow-hidden">
                            {p?.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={20} className="text-muted-foreground/50" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground">{p?.name || "Unknown Product"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p?.sku || l.productId}</TableCell>
                      <TableCell className="text-right font-medium">{l.qty}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(l.unitPrice)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatINR(lineTax)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(lineSubtotal + lineTax)}</TableCell>
                      <TableCell className="text-right w-24">
                        {isOutOfStock && (
                          <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                            Out of Stock
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="bg-muted/10 p-6 border-t flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div className="font-bold text-foreground">Total</div>
              <div className="w-full md:w-64 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{formatINR(total)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">{formatINR(0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-medium">{formatINR(0)}</span>
                </div>
                <div className="pt-4 mt-1 border-t flex justify-between items-center">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="font-bold text-xl text-foreground">{formatINR(total)}</span>
                </div>
              </div>
            </div>
          
      </div>

      {/* Dialogs */}
      <EditOrderDialog
        order={order}
        allCustomers={allCustomers}
        allProducts={allProducts}
        open={editOpen}
        setOpen={setEditOpen}
        onSuccess={() => void refetch()}
      />

      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to cancel order {order.id}? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialog(false)}>Keep Order</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Spinner size={16} className="animate-spin mr-2" /> : null} Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restockDialog} onOpenChange={(o) => !o && setRestockDialog(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Fulfill Restock for {order.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Please enter the restock details for the items that are currently short.
            </p>
            {restockDialog?.map((s) => (
              <div key={s.productId} className="grid grid-cols-12 gap-3 items-end border-b pb-4 last:border-0">
                <div className="col-span-5">
                  <label className="text-xs font-semibold text-muted-foreground">Product</label>
                  <div className="text-sm font-medium mt-1 truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">Need {s.required} • Have {s.available}</div>
                </div>
                <div className="col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground">Add Qty</label>
                  <input
                    type="number"
                    min="0"
                    value={restockForm[s.productId]?.qty || 0}
                    onChange={(e) => {
                      const v = Math.max(0, parseInt(e.target.value) || 0)
                      setRestockForm((prev) => ({ ...prev, [s.productId]: { ...prev[s.productId], qty: v } }))
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
                  />
                </div>
                <div className="col-span-4">
                  <label className="text-xs font-semibold text-muted-foreground">Invoice / Source</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={restockForm[s.productId]?.invoiceDetails || ""}
                    onChange={(e) => {
                      setRestockForm((prev) => ({ ...prev, [s.productId]: { ...prev[s.productId], invoiceDetails: e.target.value } }))
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
                  />
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestockDialog(null)} disabled={restocking}>Cancel</Button>
            <Button onClick={handleRestock} disabled={restocking} className="bg-amber-600 hover:bg-amber-700 text-white">
              {restocking ? <Spinner size={16} className="animate-spin mr-2" /> : null} Restock & Re-check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shipDialog} onOpenChange={setShipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Carrier</label>
              <input
                value={shipForm.carrier}
                onChange={(e) => setShipForm({ ...shipForm, carrier: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. FedEx, BlueDart..."
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Tracking Number</label>
              <input
                value={shipForm.trackingNumber}
                onChange={(e) => setShipForm({ ...shipForm, trackingNumber: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. 1Z9999999999999999"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShipDialog(false)}>Cancel</Button>
            <Button onClick={handleShip} disabled={shipping || !shipForm.carrier.trim()} className="bg-teal-600 hover:bg-teal-700 text-white">
              {shipping ? <Spinner size={16} className="animate-spin mr-2" /> : null} Confirm Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
