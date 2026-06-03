"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import type { ProductionStatus, SalesOrder, Product, BOM, ProductionOrder, WorkCenter } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Factory, Plus, Spinner, Lock, CalendarBlank } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"
import { cn } from "@/lib/utils"

const STATUS_META: Record<ProductionStatus, { label: string; color: string }> = {
  PLANNED:             { label: "Planned",          color: "bg-muted text-muted-foreground" },
  RELEASED:            { label: "Released",         color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  AWAITING_MATERIALS:  { label: "Awaiting Mats.",   color: "bg-orange-500/10 text-orange-500" },
  MATERIAL_RESERVED:   { label: "Mat. Reserved",    color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  IN_PROGRESS:         { label: "In Progress",      color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  QUALITY_CHECK:       { label: "Quality Check",    color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  PARTIALLY_COMPLETED: { label: "Partially Done",   color: "bg-indigo-500/10 text-indigo-500" },
  COMPLETED:           { label: "Completed",        color: "bg-green-500/10 text-green-600 dark:text-green-400" },
  ON_HOLD:             { label: "On Hold",          color: "bg-orange-500/10 text-orange-500" },
  CANCELLED:           { label: "Cancelled",        color: "bg-destructive/10 text-destructive" },
  REJECTED:            { label: "Rejected",         color: "bg-rose-500/10 text-rose-500" },
}

const NEXT_STATUS: Partial<Record<ProductionStatus, ProductionStatus>> = {
  PLANNED: "RELEASED",
  RELEASED: "MATERIAL_RESERVED",
  MATERIAL_RESERVED: "IN_PROGRESS",
  IN_PROGRESS: "QUALITY_CHECK",
  QUALITY_CHECK: "COMPLETED",
}

const TRANSITION_ACTION_LABELS: Record<ProductionStatus, string> = {
  PLANNED: "Release Order",
  RELEASED: "Reserve Materials",
  AWAITING_MATERIALS: "Reserve Materials",
  MATERIAL_RESERVED: "Start Production",
  IN_PROGRESS: "Send to QC",
  QUALITY_CHECK: "Complete",
  PARTIALLY_COMPLETED: "Continue",
  COMPLETED: "Complete",
  ON_HOLD: "Put on Hold",
  CANCELLED: "Cancel",
  REJECTED: "Reject",
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export default function ProductionPage() {
  const { isProduction, loading: loadingUser } = useUser()
  const { data: poResponse, loading: loadingPO, refetch: refetchPO } = useFetch<ProductionOrder[] | PaginatedResponse<ProductionOrder>>("/api/production-orders")
  const { data: soResponse } = useFetch<SalesOrder[] | PaginatedResponse<SalesOrder>>("/api/sales-orders")
  const { data: productsResponse } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")
  const { data: bomsResponse } = useFetch<BOM[] | PaginatedResponse<BOM>>("/api/boms")
  const { data: workCentersResponse } = useFetch<WorkCenter[] | PaginatedResponse<WorkCenter>>("/api/work-centers")

  const [open, setOpen] = useState(false)
  const [soId, setSoId] = useState("")
  const [productId, setProductId] = useState("")
  const [qty, setQty] = useState(50)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Scheduling fields
  const [plannedStart, setPlannedStart] = useState("")
  const [plannedEnd, setPlannedEnd] = useState("")
  const [workCenterId, setWorkCenterId] = useState("")

  const allPOs: ProductionOrder[] = poResponse
    ? Array.isArray(poResponse) ? poResponse : (poResponse as PaginatedResponse<ProductionOrder>).data
    : []
  const allSOs: SalesOrder[] = soResponse
    ? Array.isArray(soResponse) ? soResponse : (soResponse as PaginatedResponse<SalesOrder>).data
    : []
  const allProducts: Product[] = productsResponse
    ? Array.isArray(productsResponse) ? productsResponse : (productsResponse as PaginatedResponse<Product>).data
    : []
  const allBoms: BOM[] = bomsResponse
    ? Array.isArray(bomsResponse) ? bomsResponse : (bomsResponse as PaginatedResponse<BOM>).data
    : []
  const allWorkCenters: WorkCenter[] = workCentersResponse
    ? Array.isArray(workCentersResponse) ? workCentersResponse : (workCentersResponse as PaginatedResponse<WorkCenter>).data
    : []

  const activePOs = allPOs.filter((p) => ["IN_PROGRESS", "QUALITY_CHECK"].includes(p.status)).length

  const availableSOs = allSOs.filter((so) =>
    ["APPROVED", "IN_PRODUCTION"].includes(so.status)
  )

  const now = new Date()

  async function handleCreate() {
    const bom = allBoms.find((b) => b.productId === productId && b.status === "ACTIVE")
    if (!soId || !productId || qty <= 0 || !bom) return
    setSaving(true)
    try {
      await apiPost("/api/production-orders", {
        salesOrderId: soId,
        productId,
        qty,
        bomId: bom.id,
        ...(plannedStart ? { plannedStart } : {}),
        ...(plannedEnd ? { plannedEnd } : {}),
        ...(workCenterId ? { workCenterId } : {}),
      })
      toast.success("Production order created")
      setOpen(false)
      setSoId("")
      setProductId("")
      setQty(50)
      setPlannedStart("")
      setPlannedEnd("")
      setWorkCenterId("")
      refetchPO()
    } catch {
      toast.error("Failed to create production order")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusTransition(poId: string, nextStatus: ProductionStatus) {
    setUpdatingId(poId)
    try {
      await apiPatch(`/api/production-orders/${poId}/status`, { status: nextStatus })
      toast.success(`Production order updated to ${nextStatus}`)
      refetchPO()
    } catch {
      toast.error("Failed to update status")
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>Production | ShirtCo ERP</title>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Factory size={22} weight="fill" className="text-primary" /> Production Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loadingPO ? "Loading..." : `${allPOs.length} total · ${activePOs} active`}
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          disabled={loadingUser || !isProduction}
          className="gap-2"
        >
          {(!loadingUser && !isProduction) ? <Lock size={16} weight="bold" /> : <Plus size={16} weight="bold" />} New Production Order
        </Button>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_META).map(([s, meta]) => {
          const count = allPOs.filter((po) => po.status === s).length
          if (count === 0) return null
          return (
            <span key={s} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
              {meta.label}: {count}
            </span>
          )
        })}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loadingPO ? (
          <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Spinner className="animate-spin" size={16} /> Loading production orders...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold text-xs">Order ID</TableHead>
                <TableHead className="font-semibold text-xs">Sales Order</TableHead>
                <TableHead className="font-semibold text-xs">Product</TableHead>
                <TableHead className="font-semibold text-xs">Qty</TableHead>
                <TableHead className="font-semibold text-xs">BOM</TableHead>
                <TableHead className="font-semibold text-xs">Status</TableHead>
                <TableHead className="font-semibold text-xs">Work Center</TableHead>
                <TableHead className="font-semibold text-xs">Planned End</TableHead>
                <TableHead className="font-semibold text-xs">Created</TableHead>
                <TableHead className="font-semibold text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPOs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    <Factory size={32} className="mx-auto mb-2 opacity-30" />
                    No production orders yet
                  </TableCell>
                </TableRow>
              )}
              {allPOs.map((po) => {
                const product = allProducts.find((p) => p.id === po.productId)
                const meta = STATUS_META[po.status]
                const next = NEXT_STATUS[po.status]
                const isUpdating = updatingId === po.id
                const workCenter = allWorkCenters.find((wc) => wc.id === po.workCenterId)

                // OTD check: past planned_end and not yet COMPLETED/CANCELLED/REJECTED
                const isOverdue = po.plannedEnd
                  && new Date(po.plannedEnd) < now
                  && !["COMPLETED", "CANCELLED", "REJECTED"].includes(po.status)

                return (
                  <TableRow key={po.id} className={cn("hover:bg-muted/20 transition-colors", isOverdue && "bg-red-500/5")}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">{po.id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{po.salesOrderId || "Manual"}</TableCell>
                    <TableCell className="font-medium text-[13px]">{product?.name ?? po.productId}</TableCell>
                    <TableCell className="font-semibold text-[13px]">{po.qty.toLocaleString("en-IN")} pcs</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{po.bomId}</TableCell>
                    <TableCell>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {workCenter?.name ?? (po.workCenterId ? po.workCenterId : "—")}
                    </TableCell>
                    <TableCell>
                      {po.plannedEnd ? (
                        <span className={cn(
                          "text-xs font-medium flex items-center gap-1",
                          isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"
                        )}>
                          {isOverdue && <CalendarBlank size={11} weight="fill" className="text-red-500" />}
                          {formatDate(po.plannedEnd)}
                          {isOverdue && <span className="text-[10px] font-bold text-red-500 ml-1">OVERDUE</span>}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</TableCell>
                    <TableCell>
                      {next && next !== "COMPLETED" && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={isUpdating || loadingUser || !isProduction}
                          onClick={() => handleStatusTransition(po.id, next)}
                        >
                          {isUpdating ? <Spinner className="animate-spin mr-1" size={10} /> : null}
                          {(!loadingUser && !isProduction) ? <Lock size={10} className="mr-1" /> : null}
                          {TRANSITION_ACTION_LABELS[po.status]}
                        </Button>
                      )}
                      {next === "COMPLETED" && (
                        <span className="text-xs text-muted-foreground italic">Complete in MES</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">New Production Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Order</label>
              <select value={soId} onChange={(e) => setSoId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">-- Choose Sales Order (Optional) --</option>
                {availableSOs.map((so) => (
                  <option key={so.id} value={so.id}>{so.id} — {so.customerId}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</label>
              <select value={productId} onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">-- Select Product --</option>
                {allProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {productId && !allBoms.find((b) => b.productId === productId && b.status === "ACTIVE") && (
                <p className="text-xs text-amber-500">No active BOM found for this product</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity (shirts)</label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
              />
            </div>

            {/* Scheduling fields */}
            <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Scheduling <span className="font-normal normal-case text-muted-foreground">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Planned Start</label>
                  <input
                    type="date"
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Planned End</label>
                  <input
                    type="date"
                    value={plannedEnd}
                    onChange={(e) => setPlannedEnd(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-medium">Work Center</label>
                <select
                  value={workCenterId}
                  onChange={(e) => setWorkCenterId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">-- Select Work Center --</option>
                  {allWorkCenters.filter((wc) => wc.isActive).map((wc) => (
                    <option key={wc.id} value={wc.id}>
                      {wc.name} ({wc.capacityPerDay} {wc.unit}/day)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !productId || !allBoms.find((b) => b.productId === productId && b.status === "ACTIVE")}
            >
              {saving && <Spinner size={12} className="animate-spin mr-1" />}
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
