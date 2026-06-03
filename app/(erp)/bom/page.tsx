"use client"

import { useState } from "react"
import { useFetch, apiPatch } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TreeStructure, CheckCircle, PencilSimple, Archive, Plus, Trash, Spinner, Lock, Warning, Link } from "@phosphor-icons/react"
import type { BOM, BOMComponent, BOMStatus, Product, RawMaterial } from "@/lib/types"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

const STATUS_META: Record<BOMStatus, { label: string; color: string }> = {
  DRAFT:        { label: "Draft",        color: "bg-muted text-muted-foreground" },
  ACTIVE:       { label: "Active",       color: "bg-emerald-500/10 text-emerald-600" },
  ARCHIVED:     { label: "Archived",     color: "bg-rose-500/10 text-rose-500" },
  UNDER_REVIEW: { label: "Under Review", color: "bg-yellow-500/10 text-yellow-600" },
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export default function BOMPage() {
  const { isProduction, loading: loadingUser } = useUser()
  const { data: bomsResponse, loading: loadingBoms, refetch: refetchBoms } = useFetch<BOM[] | PaginatedResponse<BOM>>("/api/boms")
  const { data: productsResponse } = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")
  const { data: rawMaterialsResponse } = useFetch<RawMaterial[] | PaginatedResponse<RawMaterial>>("/api/raw-materials")

  const allBoms: BOM[] = bomsResponse
    ? Array.isArray(bomsResponse) ? bomsResponse : (bomsResponse as PaginatedResponse<BOM>).data
    : []
  const allProducts: Product[] = productsResponse
    ? Array.isArray(productsResponse) ? productsResponse : (productsResponse as PaginatedResponse<Product>).data
    : []
  const allMaterials: RawMaterial[] = rawMaterialsResponse
    ? Array.isArray(rawMaterialsResponse) ? rawMaterialsResponse : (rawMaterialsResponse as PaginatedResponse<RawMaterial>).data
    : []

  // Edit BOM state
  const [editBom, setEditBom] = useState<BOM | null>(null)
  const [editVersion, setEditVersion] = useState("")
  const [editComponents, setEditComponents] = useState<BOMComponent[]>([])
  const [newMaterialId, setNewMaterialId] = useState("")
  const [newQty, setNewQty] = useState(1)
  const [saving, setSaving] = useState(false)

  // Active BOM edit warning dialog
  const [activeBomWarning, setActiveBomWarning] = useState<BOM | null>(null)

  function openEdit(bom: BOM) {
    if (bom.status === "ACTIVE") {
      // Show confirmation dialog before opening edit for ACTIVE BOMs
      setActiveBomWarning(bom)
      return
    }
    doOpenEdit(bom)
  }

  function doOpenEdit(bom: BOM) {
    setEditBom(bom)
    setEditVersion(bom.version)
    setEditComponents([...bom.components])
    setNewMaterialId("")
    setNewQty(1)
  }

  function confirmActiveEdit() {
    if (!activeBomWarning) return
    doOpenEdit(activeBomWarning)
    setActiveBomWarning(null)
  }

  async function handleStatusChange(bomId: string, status: BOMStatus) {
    try {
      await apiPatch(`/api/boms/${bomId}/status`, { status })
      toast.success(`BOM status updated to ${status}`)
      refetchBoms()
    } catch {
      toast.error("Failed to update status")
    }
  }

  function addComponent() {
    if (!newMaterialId) { toast.error("Please select a raw material"); return }
    if (newQty <= 0) { toast.error("Quantity must be greater than 0"); return }
    if (editComponents.some((c) => c.materialId === newMaterialId)) {
      toast.error("Component already exists in this BOM")
      return
    }
    setEditComponents([...editComponents, { materialId: newMaterialId, qtyPerUnit: newQty }])
    setNewMaterialId("")
    setNewQty(1)
  }

  function removeComponent(materialId: string) {
    setEditComponents(editComponents.filter((c) => c.materialId !== materialId))
  }

  function updateComponentQty(materialId: string, qty: number) {
    setEditComponents(editComponents.map((c) => c.materialId === materialId ? { ...c, qtyPerUnit: Math.max(0.01, qty) } : c))
  }

  async function handleSaveBOM() {
    if (!editBom) return
    if (!editVersion.trim()) { toast.error("Version is required"); return }
    if (editComponents.length === 0) { toast.error("BOM must contain at least one component"); return }
    setSaving(true)
    try {
      const isActive = editBom.status === "ACTIVE"
      await apiPatch(`/api/boms/${editBom.id}`, {
        version: editVersion,
        components: editComponents,
        ...(isActive ? { createNewVersion: true } : {}),
      })
      toast.success(isActive
        ? "Active BOM archived and new draft version created"
        : "BOM updated successfully"
      )
      setEditBom(null)
      refetchBoms()
    } catch {
      toast.error("Failed to update BOM")
    } finally {
      setSaving(false)
    }
  }

  // Get materials that are not yet added to edit list
  const availableMaterials = allMaterials.filter(
    (m) => !editComponents.some((ec) => ec.materialId === m.id)
  )

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <title>Bill of Materials | ShirtCo ERP</title>
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <TreeStructure size={22} weight="fill" className="text-primary" /> Bill of Materials
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Component requirements per shirt product</p>
      </div>

      {loadingBoms ? (
        <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Spinner className="animate-spin" size={16} /> Loading Bill of Materials...
        </div>
      ) : allBoms.length === 0 ? (
        <div className="glass-card py-16 text-center text-muted-foreground">
          <TreeStructure size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No BOMs found</p>
        </div>
      ) : (
        <div className="space-y-5">
          {allBoms.map((bom) => {
            const product = allProducts.find((p) => p.id === bom.productId)
            const meta = STATUS_META[bom.status] ?? { label: bom.status, color: "bg-muted text-muted-foreground" }
            // Find the BOM this one supersedes (parent)
            const parentBom = bom.parentBomId
              ? allBoms.find((b) => b.id === bom.parentBomId)
              : null
            return (
              <div key={bom.id} className="rounded-xl border bg-card overflow-hidden">
                {/* BOM Header */}
                <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-4">
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <TreeStructure size={18} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-[15px]">{product?.name ?? bom.productId}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {bom.id} · {bom.version} · by {bom.createdBy}
                    </p>
                    {/* Version history / supersedes indicator */}
                    {bom.parentBomId && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Link size={10} className="opacity-60" />
                        Supersedes:{" "}
                        <span className="font-mono font-semibold text-primary/70">
                          {parentBom ? `${bom.parentBomId} (${parentBom.version})` : bom.parentBomId}
                        </span>
                      </p>
                    )}
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
                    {meta.label}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      className="gap-1"
                      disabled={loadingUser || !isProduction || bom.status === "ARCHIVED"}
                      onClick={() => openEdit(bom)}
                    >
                      {(!loadingUser && !isProduction) ? <Lock size={12} /> : <PencilSimple size={12} />} Edit Components
                    </Button>
                    {bom.status === "DRAFT" && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="gap-1 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/5"
                        disabled={loadingUser || !isProduction}
                        onClick={() => handleStatusChange(bom.id, "ACTIVE")}
                      >
                        {(!loadingUser && !isProduction) ? <Lock size={12} /> : <CheckCircle size={12} />} Activate
                      </Button>
                    )}
                    {bom.status === "ACTIVE" && (
                      <Button
                        size="xs"
                        variant="outline"
                        className="gap-1 text-muted-foreground"
                        disabled={loadingUser || !isProduction}
                        onClick={() => handleStatusChange(bom.id, "ARCHIVED")}
                      >
                        {(!loadingUser && !isProduction) ? <Lock size={12} /> : <Archive size={12} />} Archive
                      </Button>
                    )}
                  </div>
                </div>

                {/* Components table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableHead className="font-semibold text-xs">Component / Raw Material</TableHead>
                      <TableHead className="font-semibold text-xs">Unit</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Qty per Shirt</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Qty for 100 Shirts</TableHead>
                      <TableHead className="font-semibold text-xs text-right">Current Stock</TableHead>
                      <TableHead className="font-semibold text-xs">Can Produce</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.components.map((comp) => {
                      const rm = allMaterials.find((r) => r.id === comp.materialId)
                      const canProduce = rm ? Math.floor(rm.currentStock / comp.qtyPerUnit) : 0
                      const isBottleneck = canProduce < 100
                      return (
                        <TableRow key={comp.materialId} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="font-medium text-[13px]">{rm?.name ?? comp.materialId}</TableCell>
                          <TableCell className="text-[12px] text-muted-foreground">{rm?.unit ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-[13px]">{comp.qtyPerUnit}</TableCell>
                          <TableCell className="text-right text-[12px] text-muted-foreground">{(comp.qtyPerUnit * 100).toFixed(0)}</TableCell>
                          <TableCell className="text-right text-[12px] text-muted-foreground">
                            {rm?.currentStock.toLocaleString("en-IN") ?? "—"}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${isBottleneck ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                              {canProduce.toLocaleString("en-IN")} units
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )
          })}
        </div>
      )}

      {/* Active BOM edit warning dialog */}
      <Dialog open={!!activeBomWarning} onOpenChange={(o) => !o && setActiveBomWarning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-amber-600">
              <Warning size={20} weight="fill" /> Edit Active BOM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                This BOM is currently ACTIVE
              </p>
              <p className="text-muted-foreground text-xs">
                Editing an active BOM will <strong>archive</strong> the current version and create a <strong>new draft version</strong> with your changes. The original BOM will be preserved in the version history.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              BOM: <span className="font-mono font-semibold text-primary">{activeBomWarning?.id}</span>
              {" · "}{activeBomWarning?.version}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveBomWarning(null)}>No, Keep as Is</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={confirmActiveEdit}
            >
              Yes, Create New Version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Components Dialog */}
      <Dialog open={!!editBom} onOpenChange={(o) => !o && setEditBom(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              Edit BOM Components
              {editBom?.status === "ACTIVE" && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600">
                  Will create new version
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">BOM Version</label>
                <input value={editVersion} onChange={(e) => setEditVersion(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product</label>
                <input value={allProducts.find((p) => p.id === editBom?.productId)?.name ?? editBom?.productId ?? ""} disabled
                  className="w-full rounded-lg border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground" />
              </div>
            </div>

            {/* Components list */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Active Components</label>
              <div className="border rounded-lg overflow-hidden bg-muted/10 max-h-[220px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="font-semibold text-xs py-2">Material</TableHead>
                      <TableHead className="font-semibold text-xs text-right py-2 w-28">Qty per Unit</TableHead>
                      <TableHead className="font-semibold text-xs text-center py-2 w-16">Remove</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editComponents.map((comp) => {
                      const rm = allMaterials.find((r) => r.id === comp.materialId)
                      return (
                        <TableRow key={comp.materialId} className="hover:bg-muted/20">
                          <TableCell className="font-medium text-[13px] py-1.5">
                            {rm?.name ?? comp.materialId} <span className="text-[10px] text-muted-foreground block font-mono">{comp.materialId}</span>
                          </TableCell>
                          <TableCell className="text-right py-1.5">
                            <div className="flex items-center gap-1 justify-end">
                              <input type="number" step="0.01" min="0.01" value={comp.qtyPerUnit}
                                onChange={(e) => updateComponentQty(comp.materialId, parseFloat(e.target.value) || 0.01)}
                                className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs" />
                              <span className="text-[11px] text-muted-foreground w-12 text-left ml-1">{rm?.unit ?? "pcs"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center py-1.5">
                            <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive hover:bg-destructive/5"
                              onClick={() => removeComponent(comp.materialId)}>
                              <Trash size={12} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Add new component controls */}
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Add New Component</p>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Select Material</label>
                  <select value={newMaterialId} onChange={(e) => setNewMaterialId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs">
                    <option value="">-- Choose Material --</option>
                    {availableMaterials.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                    ))}
                  </select>
                </div>
                <div className="w-24 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Qty per Unit</label>
                  <input type="number" step="0.01" min="0.01" value={newQty}
                    onChange={(e) => setNewQty(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-right" />
                </div>
                <Button variant="outline" size="sm" onClick={addComponent} className="gap-1 shrink-0 h-8">
                  <Plus size={11} /> Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBom(null)}>Cancel</Button>
            <Button onClick={handleSaveBOM} disabled={saving}>
              {saving && <Spinner size={13} className="animate-spin mr-1" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
