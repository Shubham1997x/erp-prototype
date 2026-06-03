"use client"

import { useState } from "react"
import { useFetch, apiPost } from "@/hooks/use-api"
import type { RawMaterial, Product, Supplier, BOM } from "@/lib/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Package, Warning, CheckCircle, Plus, Minus, Spinner, Info, TreeStructure, Buildings, Lock } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

export default function InventoryPage() {
  const { isInventory, loading: loadingUser } = useUser()
  const { data: rawMaterials, loading: loadingRM, refetch: refetchRM } = useFetch<RawMaterial[]>("/api/raw-materials")
  const { data: products, loading: loadingProd, refetch: refetchProd } = useFetch<Product[]>("/api/products")
  const { data: suppliers } = useFetch<Supplier[]>("/api/suppliers")
  const { data: boms, refetch: refetchBoms } = useFetch<BOM[]>("/api/boms")

  const [adjustDialog, setAdjustDialog] = useState<{ type: "raw_material" | "product"; id: string; name: string } | null>(null)
  const [detailProduct, setDetailProduct] = useState<Product | null>(null)
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  // Add Product state
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [addProductForm, setAddProductForm] = useState({
    name: "",
    sku: "",
    price: 0,
    unitOfMeasure: "pcs",
    startingStock: 0,
  })

  // Add Raw Material state
  const [addRMOpen, setAddRMOpen] = useState(false)
  const [addRMForm, setAddRMForm] = useState({
    name: "",
    unit: "pcs",
    supplierId: "",
    reorderPoint: 100,
    startingStock: 0,
  })

  const rms = rawMaterials ?? []
  const prods = products ?? []
  const sups = suppliers ?? []
  const allBoms = boms ?? []

  const totalRMValue = rms.reduce((s, rm) => s + rm.currentStock * 50, 0) // rough cost estimate
  const totalFGValue = prods.reduce((s, p) => s + p.currentStock * p.price, 0)
  const lowStock = rms.filter((rm) => rm.currentStock <= rm.reorderPoint)

  async function handleAdjust() {
    if (!adjustDialog || delta === 0) return
    setSaving(true)
    try {
      await apiPost("/api/stock", { entityType: adjustDialog.type, entityId: adjustDialog.id, delta, reason: reason || "Manual Adjustment" })
      toast.success(`Stock adjusted by ${delta > 0 ? "+" : ""}${delta}`)
      setAdjustDialog(null)
      setDelta(0)
      setReason("")
      if (adjustDialog.type === "raw_material") refetchRM()
      else refetchProd()
    } catch {
      toast.error("Failed to adjust stock")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateProduct() {
    if (!addProductForm.name.trim()) { toast.error("Product name is required"); return }
    if (addProductForm.price < 0) { toast.error("Price cannot be negative"); return }
    setSaving(true)
    try {
      await apiPost("/api/products", addProductForm)
      toast.success("Product and draft BOM created successfully")
      setAddProductOpen(false)
      setAddProductForm({ name: "", sku: "", price: 0, unitOfMeasure: "pcs", startingStock: 0 })
      refetchProd()
      refetchBoms()
    } catch {
      toast.error("Failed to create product")
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateRM() {
    if (!addRMForm.name.trim()) { toast.error("Material name is required"); return }
    if (!addRMForm.unit.trim()) { toast.error("Unit of measure is required"); return }
    setSaving(true)
    try {
      await apiPost("/api/raw-materials", addRMForm)
      toast.success("Raw material created successfully")
      setAddRMOpen(false)
      setAddRMForm({ name: "", unit: "pcs", supplierId: "", reorderPoint: 100, startingStock: 0 })
      refetchRM()
    } catch {
      toast.error("Failed to create raw material")
    } finally {
      setSaving(false)
    }
  }

  // Find BOM for a selected product
  const productBom = detailProduct 
    ? allBoms.find((b) => b.productId === detailProduct.id || b.id === detailProduct.bomId)
    : null

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>Inventory | ShirtCo ERP</title>
      <div>
        <h1 className="section-title">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time stock levels for raw materials & finished goods</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Raw Material Value</p>
          {loadingRM ? <div className="shimmer h-7 w-20 mt-1" /> : <p className="text-2xl font-heading font-bold">₹{(totalRMValue / 1000).toFixed(0)}K</p>}
          <p className="text-[11px] text-muted-foreground">{rms.length} materials tracked</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Finished Goods Value</p>
          {loadingProd ? <div className="shimmer h-7 w-20 mt-1" /> : <p className="text-2xl font-heading font-bold">{formatINR(totalFGValue)}</p>}
          <p className="text-[11px] text-muted-foreground">{prods.length} products</p>
        </div>
        <div className={`stat-card ${lowStock.length > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            {lowStock.length > 0 ? <Warning size={11} className="text-amber-500" weight="fill" /> : <CheckCircle size={11} className="text-emerald-500" weight="fill" />}
            Low Stock Alerts
          </p>
          {loadingRM ? <div className="shimmer h-7 w-20 mt-1" /> : <p className={`text-2xl font-heading font-bold ${lowStock.length > 0 ? "text-amber-500" : "text-emerald-500"}`}>{lowStock.length}</p>}
          <p className="text-[11px] text-muted-foreground">items below reorder point</p>
        </div>
      </div>

      <Tabs defaultValue="raw">
        <TabsList>
          <TabsTrigger value="raw">Raw Materials ({rms.length})</TabsTrigger>
          <TabsTrigger value="finished">Finished Goods ({prods.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="raw" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-muted-foreground">Raw Materials Inventory</h2>
            <Button 
              onClick={() => setAddRMOpen(true)} 
              disabled={loadingUser || !isInventory} 
              className="gap-1.5 h-8"
            >
              {(!loadingUser && !isInventory) ? <Lock size={14} weight="bold" /> : <Plus size={14} weight="bold" />} Add Raw Material
            </Button>
          </div>
          <div className="glass-card overflow-hidden">
            {loadingRM ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Spinner className="animate-spin" size={16} /> Loading materials...
              </div>
            ) : rms.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No raw materials found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="table-header-row">
                    <TableHead className="font-semibold text-xs">Material</TableHead>
                    <TableHead className="font-semibold text-xs">Supplier</TableHead>
                    <TableHead className="font-semibold text-xs">Unit</TableHead>
                    <TableHead className="font-semibold text-xs">Stock Level</TableHead>
                    <TableHead className="font-semibold text-xs">Reorder At</TableHead>
                    <TableHead className="font-semibold text-xs">Status</TableHead>
                    <TableHead className="font-semibold text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rms.map((rm) => {
                    const sup = sups.find((s) => s.id === rm.supplierId)
                    const isLow = rm.currentStock <= rm.reorderPoint
                    const pct = Math.min(100, (rm.currentStock / Math.max(1, rm.reorderPoint * 2)) * 100)
                    return (
                      <TableRow key={rm.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-medium text-[13px]">{rm.name}</TableCell>
                        <TableCell className="text-[12px] text-muted-foreground">{sup?.name ?? "—"}</TableCell>
                        <TableCell className="text-[12px] text-muted-foreground">{rm.unit}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <span className={`text-sm font-bold ${isLow ? "text-amber-500" : ""}`}>
                              {rm.currentStock.toLocaleString("en-IN")}
                            </span>
                            <div className="h-1 w-28 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${isLow ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-[12px] text-muted-foreground">{rm.reorderPoint.toLocaleString("en-IN")}</TableCell>
                        <TableCell>
                          <span className={`badge-status ${isLow ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"}`}>
                            {isLow ? "⚠ Low Stock" : "✓ OK"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="xs" 
                            disabled={loadingUser || !isInventory}
                            onClick={() => { setAdjustDialog({ type: "raw_material", id: rm.id, name: rm.name }); setDelta(0); setReason("") }}
                          >
                            {(!loadingUser && !isInventory) && <Lock size={10} className="mr-1" />} Adjust
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="finished" className="mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold text-muted-foreground">Finished Products Catalog</h2>
            <Button 
              onClick={() => setAddProductOpen(true)} 
              disabled={loadingUser || !isInventory} 
              className="gap-1.5 h-8"
            >
              {(!loadingUser && !isInventory) ? <Lock size={14} weight="bold" /> : <Plus size={14} weight="bold" />} Add Product
            </Button>
          </div>
          <div className="glass-card overflow-hidden">
            {loadingProd ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Spinner className="animate-spin" size={16} /> Loading products...
              </div>
            ) : prods.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No products found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="table-header-row">
                    <TableHead className="font-semibold text-xs">Product</TableHead>
                    <TableHead className="font-semibold text-xs">SKU</TableHead>
                    <TableHead className="font-semibold text-xs">Unit Price</TableHead>
                    <TableHead className="font-semibold text-xs">In Stock</TableHead>
                    <TableHead className="font-semibold text-xs">Stock Value</TableHead>
                    <TableHead className="font-semibold text-xs text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prods.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell className="font-medium text-[13px]">
                        <button onClick={() => setDetailProduct(p)} className="text-left font-semibold text-primary hover:underline flex items-center gap-1">
                          {p.name} <Info size={13} className="opacity-60" />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="font-bold text-[13px]">₹{p.price.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-bold ${p.currentStock < 50 ? "text-amber-500" : "text-emerald-500"}`}>
                          {p.currentStock} {p.unitOfMeasure}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-[13px]">{formatINR(p.currentStock * p.price)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button variant="outline" size="xs" onClick={() => setDetailProduct(p)}>
                            Details
                          </Button>
                          <Button 
                            variant="outline" 
                            size="xs" 
                            disabled={loadingUser || !isInventory}
                            onClick={() => { setAdjustDialog({ type: "product", id: p.id, name: p.name }); setDelta(0); setReason("") }}
                          >
                            {(!loadingUser && !isInventory) && <Lock size={10} className="mr-1" />} Adjust
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Adjust stock dialog */}
      <Dialog open={!!adjustDialog} onOpenChange={(o) => !o && setAdjustDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Adjust Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground font-medium">{adjustDialog?.name}</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity (+ add / − remove)</label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" onClick={() => setDelta((d) => d - 1)}><Minus size={14} /></Button>
                <input type="number" value={delta} onChange={(e) => setDelta(parseInt(e.target.value) || 0)}
                  className="flex-1 text-center rounded-lg border border-input bg-background px-2 py-1.5 text-sm font-bold" />
                <Button variant="outline" size="icon-sm" onClick={() => setDelta((d) => d + 1)}><Plus size={14} /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Goods receipt, Damaged stock..."
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={delta === 0 || saving}>
              {saving && <Spinner size={13} className="animate-spin mr-1" />} Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Detail Dialog (incorporating BOM details) */}
      <Dialog open={!!detailProduct} onOpenChange={(o) => !o && setDetailProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Package size={20} className="text-primary" weight="fill" /> {detailProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {detailProduct && (
            <div className="space-y-4 py-2 text-sm">
              <div className="grid grid-cols-2 gap-3 border rounded-xl p-3 bg-muted/10">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">SKU</span>
                  <span className="font-mono text-xs">{detailProduct.sku}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Unit Price</span>
                  <span className="font-bold">₹{detailProduct.price.toLocaleString("en-IN")}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Current Stock</span>
                  <span className={`font-semibold ${detailProduct.currentStock < 50 ? "text-amber-500" : "text-emerald-500"}`}>
                    {detailProduct.currentStock} {detailProduct.unitOfMeasure}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Stock Value</span>
                  <span className="font-bold">{formatINR(detailProduct.currentStock * detailProduct.price)}</span>
                </div>
              </div>

              {/* Linked BOM details */}
              <div className="space-y-2 border rounded-xl p-3 bg-muted/5">
                <div className="flex items-center justify-between border-b pb-1.5 border-border/50">
                  <span className="font-semibold text-xs flex items-center gap-1.5 text-muted-foreground">
                    <TreeStructure size={13} /> Bill of Materials (BOM)
                  </span>
                  {productBom ? (
                    <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-bold">
                      {productBom.version} · {productBom.status}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold">
                      No Active BOM
                    </span>
                  )}
                </div>

                {productBom ? (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pt-1">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/30">
                          <th className="pb-1 font-semibold">Material</th>
                          <th className="pb-1 font-semibold text-right">Required (per shirt)</th>
                          <th className="pb-1 font-semibold text-right">Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {productBom.components.map((c) => {
                          const mat = rms.find((rm) => rm.id === c.materialId)
                          const isLow = mat ? mat.currentStock < c.qtyPerUnit : true
                          return (
                            <tr key={c.materialId}>
                              <td className="py-1 font-medium text-muted-foreground truncate max-w-[150px]">{mat?.name ?? c.materialId}</td>
                              <td className="py-1 text-right font-mono font-semibold">{c.qtyPerUnit} {mat?.unit ?? ""}</td>
                              <td className={`py-1 text-right font-mono ${isLow ? "text-amber-500 font-bold" : "text-muted-foreground"}`}>
                                {mat ? mat.currentStock.toLocaleString("en-IN") : "0"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Create a BOM for this product on the Bill of Materials page.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailProduct(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Product Dialog */}
      <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add New Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Name *</label>
              <input value={addProductForm.name} onChange={(e) => setAddProductForm({ ...addProductForm, name: e.target.value })}
                placeholder="e.g. Classic Denim Shirt"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU (optional)</label>
              <input value={addProductForm.sku} onChange={(e) => setAddProductForm({ ...addProductForm, sku: e.target.value })}
                placeholder="e.g. SHT-DEN-004 (Auto-generated if blank)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price (₹) *</label>
                <input type="number" min={0} value={addProductForm.price} onChange={(e) => setAddProductForm({ ...addProductForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit of Measure</label>
                <select value={addProductForm.unitOfMeasure} onChange={(e) => setAddProductForm({ ...addProductForm, unitOfMeasure: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="pcs">pcs (pieces)</option>
                  <option value="metres">metres</option>
                  <option value="spools">spools</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Starting Stock</label>
              <input type="number" min={0} value={addProductForm.startingStock} onChange={(e) => setAddProductForm({ ...addProductForm, startingStock: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProductOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateProduct} disabled={!addProductForm.name.trim() || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Create Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Raw Material Dialog */}
      <Dialog open={addRMOpen} onOpenChange={setAddRMOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-1.5">
              <Buildings size={20} className="text-primary" /> Add Raw Material
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Material Name *</label>
              <input value={addRMForm.name} onChange={(e) => setAddRMForm({ ...addRMForm, name: e.target.value })}
                placeholder="e.g. Cotton Yarn (White)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit of Measure *</label>
                <select value={addRMForm.unit} onChange={(e) => setAddRMForm({ ...addRMForm, unit: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="metres">metres</option>
                  <option value="pcs">pcs (pieces)</option>
                  <option value="spools">spools</option>
                  <option value="rolls">rolls</option>
                  <option value="kg">kg (kilograms)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Default Supplier</label>
                <select value={addRMForm.supplierId} onChange={(e) => setAddRMForm({ ...addRMForm, supplierId: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="">-- Select Supplier --</option>
                  {sups.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reorder Point</label>
                <input type="number" min={0} value={addRMForm.reorderPoint} onChange={(e) => setAddRMForm({ ...addRMForm, reorderPoint: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Starting Stock</label>
                <input type="number" min={0} value={addRMForm.startingStock} onChange={(e) => setAddRMForm({ ...addRMForm, startingStock: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRMOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRM} disabled={!addRMForm.name.trim() || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Create Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
