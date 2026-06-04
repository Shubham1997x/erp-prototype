"use client"

import { useState, useEffect } from "react"
import { useFetch, apiPost } from "@/hooks/use-api"
import type { Product } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Package, Warning, CheckCircle, Spinner, ArrowUp } from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

export default function ProductsPage() {
  const { data: productsRes, loading, refetch } = useFetch<Product[] | { data: Product[] }>("/api/products")

  // Current user for RBAC
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch {}
    }
  }, [])

  // Add product
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ name: "", sku: "", price: 0, unitOfMeasure: "pcs", startingStock: 0 })

  // Add stock (restock)
  const [stockDialog, setStockDialog] = useState<Product | null>(null)
  const [stockQty, setStockQty] = useState(0)
  const [stockInvoiceDetails, setStockInvoiceDetails] = useState("")

  const [saving, setSaving] = useState(false)

  function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
    return []
  }

  const products = unwrap(productsRes)
  const totalValue = products.reduce((s, p) => s + p.currentStock * p.price, 0)
  const lowStock   = products.filter((p) => p.currentStock < 10)
  const inStock    = products.filter((p) => p.currentStock >= 10)

  async function handleAddProduct() {
    if (!addForm.name.trim()) { toast.error("Product name is required"); return }
    if (addForm.price <= 0)   { toast.error("Price must be greater than 0"); return }
    setSaving(true)
    try {
      await apiPost("/api/products", addForm)
      toast.success("Product added successfully")
      setAddOpen(false)
      setAddForm({ name: "", sku: "", price: 0, unitOfMeasure: "pcs", startingStock: 0 })
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add product")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddStock() {
    if (!stockDialog || stockQty <= 0) { toast.error("Enter a quantity greater than 0"); return }
    setSaving(true)
    try {
      await apiPost("/api/stock", {
        entityType: "product",
        entityId: stockDialog.id,
        delta: stockQty,
        reason: `Manual restock${stockInvoiceDetails ? ` - Invoice: ${stockInvoiceDetails}` : ""}`,
      })
      toast.success(`Added ${stockQty} units to ${stockDialog.name}`)
      setStockDialog(null)
      setStockQty(0)
      setStockInvoiceDetails("")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add stock")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <title>Products | ShirtCo ERP</title>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{products.length} products in catalog</p>
        </div>
        {(!currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager") && (
          <Button onClick={() => setAddOpen(true)} className="gap-2 shadow-sm shadow-primary/20">
            <Plus size={15} weight="bold" /> Add Product
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Total Products</p>
          <p className="text-2xl font-heading font-bold">{products.length}</p>
          <p className="text-[11px] text-muted-foreground">In catalog</p>
        </div>
        <div className={cn("stat-card", lowStock.length > 0 && "border-amber-500/30 bg-amber-500/5")}>
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            {lowStock.length > 0
              ? <Warning size={11} className="text-amber-500" weight="fill" />
              : <CheckCircle size={11} className="text-emerald-500" weight="fill" />}
            Low Stock
          </p>
          <p className={cn("text-2xl font-heading font-bold", lowStock.length > 0 ? "text-amber-500" : "text-emerald-500")}>
            {lowStock.length}
          </p>
          <p className="text-[11px] text-muted-foreground">Products below 10 units</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Stock Value</p>
          <p className="text-2xl font-heading font-bold">{formatINR(totalValue)}</p>
          <p className="text-[11px] text-muted-foreground">At selling price</p>
        </div>
      </div>

      {/* Products table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="table-header-row">
              <TableHead className="font-semibold text-xs">Product</TableHead>
              <TableHead className="font-semibold text-xs">SKU</TableHead>
              <TableHead className="font-semibold text-xs">Price</TableHead>
              <TableHead className="font-semibold text-xs">In Stock</TableHead>
              <TableHead className="font-semibold text-xs">Stock Value</TableHead>
              <TableHead className="font-semibold text-xs">Status</TableHead>
              {(!currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager") && (
                <TableHead className="font-semibold text-xs text-center">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && [...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(7)].map((_, j) => (
                  <TableCell key={j}><div className="shimmer h-4 rounded" /></TableCell>
                ))}
              </TableRow>
            ))}
            {!loading && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-20 text-center text-muted-foreground">
                  <Package size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No products yet</p>
                  <p className="text-sm mt-1">Add your first product to start managing stock</p>
                </TableCell>
              </TableRow>
            )}
            {!loading && products.map((p) => {
              const isLow = p.currentStock < 10
              const pct = Math.min(100, (p.currentStock / Math.max(1, 100)) * 100)
              return (
                <TableRow key={p.id} className={cn("hover:bg-muted/20 transition-colors", isLow && "bg-amber-500/3")}>
                  <TableCell className="font-medium text-[13px]">{p.name}</TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{p.sku || "—"}</TableCell>
                  <TableCell className="font-bold text-[13px]">{formatINR(p.price)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <span className={cn("text-sm font-bold", isLow ? "text-amber-500" : "text-emerald-500")}>
                        {p.currentStock} {p.unitOfMeasure}
                      </span>
                      <div className="h-1 w-24 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", isLow ? "bg-amber-500" : "bg-emerald-500")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-[13px]">{formatINR(p.currentStock * p.price)}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "badge-status",
                      isLow
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-emerald-500/15 text-emerald-500"
                    )}>
                      {isLow ? "⚠ Low Stock" : "✓ In Stock"}
                    </span>
                  </TableCell>
                  {(!currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager") && (
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="xs"
                        className="gap-1.5"
                        onClick={() => {
                          setStockDialog(p)
                          setStockQty(0)
                          setStockInvoiceDetails("")
                        }}
                      >
                        <ArrowUp size={12} weight="bold" /> Add Stock
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Add Product Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Package size={18} className="text-primary" /> Add New Product
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Name *</label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="e.g. Classic White Shirt"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU (optional)</label>
              <input
                value={addForm.sku}
                onChange={(e) => setAddForm({ ...addForm, sku: e.target.value })}
                placeholder="e.g. SHT-WHT-001 (auto-generated if blank)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selling Price (₹) *</label>
                <input
                  type="number" min={0}
                  value={addForm.price}
                  onChange={(e) => setAddForm({ ...addForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</label>
                <select
                  value={addForm.unitOfMeasure}
                  onChange={(e) => setAddForm({ ...addForm, unitOfMeasure: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="pcs">pcs (pieces)</option>
                  <option value="units">units</option>
                  <option value="sets">sets</option>
                  <option value="boxes">boxes</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Starting Stock</label>
              <input
                type="number" min={0}
                value={addForm.startingStock}
                onChange={(e) => setAddForm({ ...addForm, startingStock: parseInt(e.target.value) || 0 })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddProduct} disabled={!addForm.name.trim() || addForm.price <= 0 || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Stock Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!stockDialog} onOpenChange={(o) => !o && setStockDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ArrowUp size={18} className="text-emerald-500" weight="bold" /> Add Stock
            </DialogTitle>
          </DialogHeader>
          {stockDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/30 px-4 py-3">
                <p className="font-semibold text-sm">{stockDialog.name}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Current stock:{" "}
                  <span className={cn("font-bold", stockDialog.currentStock < 10 ? "text-amber-500" : "text-emerald-500")}>
                    {stockDialog.currentStock} {stockDialog.unitOfMeasure}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Quantity to Add *
                </label>
                <input
                  type="number" min={1}
                  value={stockQty || ""}
                  onChange={(e) => setStockQty(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 50"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Invoice Details <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  value={stockInvoiceDetails}
                  onChange={(e) => setStockInvoiceDetails(e.target.value)}
                  placeholder="e.g. INV-1234 from Supplier"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {stockQty > 0 && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">New stock level will be</span>
                  <span className="font-bold text-emerald-500">
                    {stockDialog.currentStock + stockQty} {stockDialog.unitOfMeasure}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>Cancel</Button>
            <Button
              onClick={handleAddStock}
              disabled={stockQty <= 0 || saving}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            >
              {saving && <Spinner size={14} className="animate-spin" />}
              <ArrowUp size={14} weight="bold" /> Add Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
