"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Wrench, CheckCircle, ArrowRight, Spinner, Lock, Clipboard, Warning } from "@phosphor-icons/react"
import type { ProductionOrder, Product, BOM, RawMaterial } from "@/lib/types"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

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

interface QCFormState {
  producedQty: number
  passedQty: number
  rejectedQty: number
  defectCodes: string
  notes: string
}

interface CompleteDialogState {
  po: ProductionOrder
  producedQty: number
  scrappedQty: number
}

export default function MESPage() {
  const { isProduction, loading: loadingUser } = useUser()
  const { data: poResponse, loading: loadingPO, refetch: refetchPO } = useFetch<ProductionOrder[] | PaginatedResponse<ProductionOrder>>("/api/production-orders")
  const { data: productsResponse } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")
  const { data: bomsResponse } = useFetch<BOM[] | PaginatedResponse<BOM>>("/api/boms")
  const { data: rawMaterialsResponse, refetch: refetchRM } = useFetch<RawMaterial[] | PaginatedResponse<RawMaterial>>("/api/raw-materials")

  const [transitioningId, setTransitioningId] = useState<string | null>(null)

  // QC inspection dialog state
  const [qcDialog, setQcDialog] = useState<{ po: ProductionOrder } | null>(null)
  const [qcForm, setQcForm] = useState<QCFormState>({
    producedQty: 0,
    passedQty: 0,
    rejectedQty: 0,
    defectCodes: "",
    notes: "",
  })
  const [submittingQC, setSubmittingQC] = useState(false)

  // Complete production confirmation dialog
  const [completeDialog, setCompleteDialog] = useState<CompleteDialogState | null>(null)
  const [completing, setCompleting] = useState(false)

  const allPOs: ProductionOrder[] = poResponse
    ? Array.isArray(poResponse) ? poResponse : (poResponse as PaginatedResponse<ProductionOrder>).data
    : []
  const allProducts: Product[] = productsResponse
    ? Array.isArray(productsResponse) ? productsResponse : (productsResponse as PaginatedResponse<Product>).data
    : []
  const allBoms: BOM[] = bomsResponse
    ? Array.isArray(bomsResponse) ? bomsResponse : (bomsResponse as PaginatedResponse<BOM>).data
    : []
  const allMaterials: RawMaterial[] = rawMaterialsResponse
    ? Array.isArray(rawMaterialsResponse) ? rawMaterialsResponse : (rawMaterialsResponse as PaginatedResponse<RawMaterial>).data
    : []

  // Only show orders that are active in MES (MATERIAL_RESERVED, IN_PROGRESS, QUALITY_CHECK)
  const activeOrders = allPOs.filter((po) =>
    ["IN_PROGRESS", "QUALITY_CHECK", "MATERIAL_RESERVED"].includes(po.status)
  )

  const completedOrders = allPOs.filter((po) => po.status === "COMPLETED")

  async function handleStatusChange(poId: string, status: string) {
    setTransitioningId(poId)
    try {
      await apiPatch(`/api/production-orders/${poId}/status`, { status })
      toast.success(`Production order updated to ${status.replace(/_/g, " ")}`)
      refetchPO()
    } catch {
      toast.error("Failed to update status")
    } finally {
      setTransitioningId(null)
    }
  }

  function openQCDialog(po: ProductionOrder) {
    setQcForm({
      producedQty: po.qty,
      passedQty: po.qty,
      rejectedQty: 0,
      defectCodes: "",
      notes: "",
    })
    setQcDialog({ po })
  }

  function updateQCForm(field: keyof QCFormState, value: string | number) {
    setQcForm((prev) => {
      const next = { ...prev, [field]: value }
      // Auto-calculate rejectedQty when producedQty or passedQty changes
      if (field === "producedQty" || field === "passedQty") {
        const produced = field === "producedQty" ? Number(value) : prev.producedQty
        const passed = field === "passedQty" ? Number(value) : prev.passedQty
        next.rejectedQty = Math.max(0, produced - passed)
      }
      return next
    })
  }

  async function handleSubmitQC() {
    if (!qcDialog) return
    const { po } = qcDialog
    if (qcForm.producedQty <= 0) { toast.error("Produced quantity must be greater than 0"); return }
    if (qcForm.passedQty < 0 || qcForm.passedQty > qcForm.producedQty) {
      toast.error("Passed quantity must be between 0 and produced quantity"); return
    }
    setSubmittingQC(true)
    try {
      // Step 1: Post QC inspection record
      await apiPost("/api/quality-inspections", {
        productionOrderId: po.id,
        producedQty: qcForm.producedQty,
        passedQty: qcForm.passedQty,
        rejectedQty: qcForm.rejectedQty,
        defectCodes: qcForm.defectCodes || null,
        notes: qcForm.notes || null,
      })
      // Step 2: Advance production order to QUALITY_CHECK
      await apiPatch(`/api/production-orders/${po.id}/status`, { status: "QUALITY_CHECK" })
      toast.success("QC inspection recorded. Order advanced to Quality Check.")
      setQcDialog(null)
      refetchPO()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit QC inspection")
    } finally {
      setSubmittingQC(false)
    }
  }

  function openCompleteDialog(po: ProductionOrder) {
    // Use QC inspection values if available on the PO, otherwise default to qty
    const producedQty = po.producedQty ?? po.qty
    const scrappedQty = po.scrappedQty ?? 0
    setCompleteDialog({ po, producedQty, scrappedQty })
  }

  async function handleCompleteProduction() {
    if (!completeDialog) return
    const { po, producedQty, scrappedQty } = completeDialog
    setCompleting(true)
    try {
      await apiPost(`/api/production-orders/${po.id}/complete`, { producedQty, scrappedQty })
      toast.success(`Production completed! ${producedQty} units produced, ${scrappedQty} scrapped. Inventory updated.`)
      setCompleteDialog(null)
      refetchPO()
      refetchRM()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete production order")
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>MES | ShirtCo ERP</title>
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Wrench size={22} weight="fill" className="text-primary" /> Manufacturing Execution System (MES)
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Record production completion and trigger automatic inventory updates
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-primary mb-1">How MES Works</p>
        <p className="text-muted-foreground">
          When you <strong>Send to QC</strong>, a QC inspection form is recorded first. When you <strong>Complete</strong> a production order, the system automatically deducts raw materials from inventory (per BOM) and adds the finished shirts to finished goods stock, logging movements in the audit trail.
        </p>
      </div>

      {loadingPO ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Spinner className="animate-spin" size={16} /> Loading MES workspace...
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Wrench size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No active production orders</p>
          <p className="text-sm mt-1">Move production orders to IN PROGRESS from the Production module</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeOrders.map((po) => {
            const product = allProducts.find((p) => p.id === po.productId)
            const bom = allBoms.find((b) => b.id === po.bomId)
            const isTransitioning = transitioningId === po.id

            return (
              <div key={po.id} className="rounded-xl border bg-card overflow-hidden">
                {/* Order header */}
                <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-4">
                  <div className="size-9 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
                    <Wrench size={18} weight="fill" />
                  </div>
                  <div className="flex-1">
                    <p className="font-heading font-semibold text-[15px]">{product?.name ?? po.productId}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {po.id} · {po.qty} shirts · Sales Order: {po.salesOrderId || "Manual"} · Updated: {formatDate(po.updatedAt)}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                    po.status === "IN_PROGRESS" ? "bg-purple-500/15 text-purple-400" :
                    po.status === "QUALITY_CHECK" ? "bg-cyan-500/15 text-cyan-400" :
                    "bg-yellow-500/15 text-yellow-400"
                  }`}>
                    {po.status.replace(/_/g, " ")}
                  </span>

                  <div className="flex gap-2">
                    {po.status === "MATERIAL_RESERVED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTransitioning || loadingUser || !isProduction}
                        onClick={() => handleStatusChange(po.id, "IN_PROGRESS")}
                        className="gap-1"
                      >
                        {isTransitioning && <Spinner className="animate-spin mr-1" size={10} />}
                        {(!loadingUser && !isProduction) ? <Lock size={13} /> : <ArrowRight size={13} />} Start Production
                      </Button>
                    )}
                    {po.status === "IN_PROGRESS" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isTransitioning || loadingUser || !isProduction}
                        onClick={() => openQCDialog(po)}
                        className="gap-1"
                      >
                        {isTransitioning && <Spinner className="animate-spin mr-1" size={10} />}
                        {(!loadingUser && !isProduction) ? <Lock size={13} /> : <Clipboard size={13} />} Send to QC
                      </Button>
                    )}
                    {po.status === "QUALITY_CHECK" && (
                      <Button
                        size="sm"
                        disabled={loadingUser || !isProduction}
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openCompleteDialog(po)}
                      >
                        {(!loadingUser && !isProduction) ? <Lock size={13} /> : <CheckCircle size={13} weight="fill" />}
                        Complete & Update Inventory
                      </Button>
                    )}
                  </div>
                </div>

                {/* Material consumption preview */}
                {bom && (
                  <div className="p-4 bg-muted/5">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3">
                      Material Consumption Preview (BOM: {bom.version})
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                      {bom.components.map((comp) => {
                        const rm = allMaterials.find((r) => r.id === comp.materialId)
                        const needed = comp.qtyPerUnit * po.qty
                        const sufficient = (rm?.currentStock ?? 0) >= needed
                        return (
                          <div
                            key={comp.materialId}
                            className={`rounded-lg border p-3 bg-card ${sufficient ? "border-border" : "border-amber-500/30 bg-amber-500/5"}`}
                          >
                            <p className="text-xs font-semibold truncate text-muted-foreground">{rm?.name ?? comp.materialId}</p>
                            <p className={`text-sm font-bold mt-1 ${sufficient ? "" : "text-amber-500"}`}>
                              -{needed.toLocaleString("en-IN")} {rm?.unit}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Stock: {rm?.currentStock?.toLocaleString("en-IN") ?? "?"} {sufficient ? "✓" : "⚠ insufficient"}
                            </p>
                          </div>
                        )
                      })}
                      {/* Finished goods output */}
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                          + Output Finished Goods
                        </p>
                        <p className="text-sm font-bold text-emerald-600 mt-1">
                          +{po.qty} shirts
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Current: {product?.currentStock ?? 0} pcs
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* QC Inspection Form Dialog */}
      <Dialog open={!!qcDialog} onOpenChange={(o) => !o && setQcDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Clipboard size={18} className="text-primary" /> QC Inspection Form
            </DialogTitle>
          </DialogHeader>
          {qcDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/10 p-3 text-xs">
                <p className="font-semibold text-muted-foreground">
                  Order: <span className="font-mono text-primary">{qcDialog.po.id}</span>
                  {" · "}{allProducts.find((p) => p.id === qcDialog.po.productId)?.name ?? qcDialog.po.productId}
                  {" · "}{qcDialog.po.qty} pcs planned
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Produced Qty <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={qcForm.producedQty}
                    onChange={(e) => updateQCForm("producedQty", parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Passed Qty <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={qcForm.producedQty}
                    value={qcForm.passedQty}
                    onChange={(e) => updateQCForm("passedQty", parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rejected Qty</label>
                <input
                  type="number"
                  min={0}
                  value={qcForm.rejectedQty}
                  onChange={(e) => updateQCForm("rejectedQty", parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold text-rose-600"
                  placeholder="Auto-calculated"
                />
                <p className="text-[10px] text-muted-foreground">
                  Auto-calculated as Produced - Passed. You may override manually.
                </p>
              </div>

              {qcForm.rejectedQty > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Defect Codes <span className="text-muted-foreground font-normal">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={qcForm.defectCodes}
                    onChange={(e) => updateQCForm("defectCodes", e.target.value)}
                    placeholder="e.g. STITCH_FAIL, FABRIC_TEAR, COLOR_BLEED"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
                <textarea
                  value={qcForm.notes}
                  onChange={(e) => updateQCForm("notes", e.target.value)}
                  placeholder="Optional inspection notes..."
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Summary banner */}
              <div className={`rounded-lg p-3 text-xs ${
                qcForm.rejectedQty > 0
                  ? "bg-amber-500/5 border border-amber-500/20"
                  : "bg-emerald-500/5 border border-emerald-500/20"
              }`}>
                <p className="font-semibold">
                  {qcForm.passedQty} passed / {qcForm.rejectedQty} rejected out of {qcForm.producedQty} produced
                </p>
                {qcForm.rejectedQty > 0 && (
                  <p className="text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Warning size={10} weight="fill" className="text-amber-500" />
                    Rejected units will be recorded as scrap
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQcDialog(null)}>Cancel</Button>
            <Button
              onClick={handleSubmitQC}
              disabled={submittingQC || qcForm.producedQty <= 0}
            >
              {submittingQC && <Spinner size={14} className="animate-spin mr-1" />}
              Submit QC & Advance to Quality Check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Production Confirmation Dialog */}
      <Dialog open={!!completeDialog} onOpenChange={(o) => !o && setCompleteDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <CheckCircle size={18} weight="fill" className="text-emerald-500" /> Complete Production
            </DialogTitle>
          </DialogHeader>
          {completeDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/10 p-3 text-xs">
                <p className="font-semibold text-muted-foreground">
                  Order: <span className="font-mono text-primary">{completeDialog.po.id}</span>
                  {" · "}{allProducts.find((p) => p.id === completeDialog.po.productId)?.name ?? completeDialog.po.productId}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produced Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={completeDialog.producedQty}
                    onChange={(e) => setCompleteDialog((d) => d ? { ...d, producedQty: parseInt(e.target.value) || 0 } : null)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold text-emerald-600"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scrapped Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={completeDialog.scrappedQty}
                    onChange={(e) => setCompleteDialog((d) => d ? { ...d, scrappedQty: parseInt(e.target.value) || 0 } : null)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold text-rose-600"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 text-sm space-y-1">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {completeDialog.producedQty} units will be added to finished goods inventory
                </p>
                {completeDialog.scrappedQty > 0 && (
                  <p className="text-rose-600 font-medium text-xs flex items-center gap-1">
                    <Warning size={11} weight="fill" /> {completeDialog.scrappedQty} units will be written off as scrap
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  Raw materials will be deducted per BOM. This action cannot be undone.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog(null)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleCompleteProduction}
              disabled={completing || !completeDialog || completeDialog.producedQty <= 0}
            >
              {completing && <Spinner size={14} className="animate-spin mr-1" />}
              Confirm & Update Inventory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completed orders list */}
      {completedOrders.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/20">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recently Completed MES runs</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="font-semibold text-xs">Order</TableHead>
                <TableHead className="font-semibold text-xs">Product</TableHead>
                <TableHead className="font-semibold text-xs">Qty Produced</TableHead>
                <TableHead className="font-semibold text-xs">Scrapped</TableHead>
                <TableHead className="font-semibold text-xs">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedOrders.map((po) => {
                const product = allProducts.find((p) => p.id === po.productId)
                return (
                  <TableRow key={po.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="font-mono text-xs text-primary">{po.id}</TableCell>
                    <TableCell className="font-medium text-[13px]">{product?.name ?? po.productId}</TableCell>
                    <TableCell className="font-bold text-[13px] text-emerald-500">+{po.producedQty ?? po.qty} pcs</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {(po.scrappedQty ?? 0) > 0
                        ? <span className="text-rose-500 font-semibold">{po.scrappedQty} pcs</span>
                        : "—"
                      }
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(po.updatedAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
