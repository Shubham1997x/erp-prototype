"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type { Product } from "@/lib/types"
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
  Package,
  Warning,
  CheckCircle,
  Spinner,
  ArrowUp,
  Eye,
  PencilSimple,
  X,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { notifyNotificationsChanged } from "@/components/providers/notification-provider"
import { Lock } from "@phosphor-icons/react"
import {
  restockToastMessage,
  type StockAdjustResponse,
} from "@/lib/stock-restock"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v)
}

export default function ProductsPage() {
  const router = useRouter()
  const {
    data: productsRes,
    loading,
    refetch,
  } = useFetch<Product[] | { data: Product[] }>("/api/products")

  const { user: currentUser } = useUser()

  // Search & pagination
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Add product
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    name: "",
    sku: "",
    price: 0,
    unitOfMeasure: "pcs",
    startingStock: 0,
    imageUrl: "",
  })
  const [uploadingImage, setUploadingImage] = useState(false)

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      setAddForm((prev) => ({ ...prev, imageUrl: data.url }))
      toast.success("Image uploaded successfully")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "An unknown error occurred")
    } finally {
      setUploadingImage(false)
    }
  }

  // Edit product
  const [editDialog, setEditDialog] = useState<Product | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    price: 0,
    unitOfMeasure: "pcs",
    imageUrl: "",
  })

  // Add stock (restock)
  const [stockDialog, setStockDialog] = useState<Product | null>(null)
  const [stockQty, setStockQty] = useState(0)
  const [stockInvoiceDetails, setStockInvoiceDetails] = useState("")

  const [saving, setSaving] = useState(false)
  const canManage =
    !currentUser ||
    currentUser.role === "Admin" ||
    currentUser.role === "Inventory Manager"

  function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as { data: T[] }).data))
      return (res as { data: T[] }).data
    return []
  }

  const products = unwrap(productsRes)
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(debouncedSearch.toLowerCase()))
  )
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const pagedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalValue = filteredProducts.reduce(
    (s, p) => s + p.currentStock * p.price,
    0
  )
  const lowStock = filteredProducts.filter((p) => p.currentStock < 10)

  async function handleAddProduct() {
    if (!addForm.name.trim()) {
      toast.error("Product name is required")
      return
    }
    if (addForm.price <= 0) {
      toast.error("Price must be greater than 0")
      return
    }
    setSaving(true)
    try {
      await apiPost("/api/products", addForm)
      toast.success("Product added successfully")
      setAddOpen(false)
      setAddForm({
        name: "",
        sku: "",
        price: 0,
        unitOfMeasure: "pcs",
        startingStock: 0,
        imageUrl: "",
      })
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add product")
    } finally {
      setSaving(false)
    }
  }

  function openEdit(product: Product) {
    setEditDialog(product)
    setEditForm({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price,
      unitOfMeasure: product.unitOfMeasure ?? "pcs",
      imageUrl: product.imageUrl ?? "",
    })
  }

  async function handleEditProduct() {
    if (!editDialog) return
    if (!editForm.name.trim()) {
      toast.error("Product name is required")
      return
    }
    if (editForm.price <= 0) {
      toast.error("Price must be greater than 0")
      return
    }
    setSaving(true)
    try {
      await apiPatch(`/api/products/${editDialog.id}`, editForm)
      toast.success("Product updated")
      setEditDialog(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update product")
    } finally {
      setSaving(false)
    }
  }

  async function handleEditImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      setEditForm((prev) => ({ ...prev, imageUrl: data.url }))
      toast.success("Image updated")
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleAddStock() {
    if (!stockDialog || stockQty <= 0) {
      toast.error("Enter a quantity greater than 0")
      return
    }
    setSaving(true)
    try {
      const result = await apiPost<StockAdjustResponse>("/api/stock", {
        entityType: "product",
        entityId: stockDialog.id,
        delta: stockQty,
        reason: `Manual restock${stockInvoiceDetails ? ` - Invoice: ${stockInvoiceDetails}` : ""}`,
      })
      toast.success(
        restockToastMessage(
          stockQty,
          stockDialog.name,
          result.autoFulfilledOrders
        )
      )
      if (result.autoFulfilledOrders?.length) notifyNotificationsChanged()
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
    <div className="mx-auto w-full space-y-5 p-4 sm:p-6 lg:px-10">
      <title>Products | ShirtCo ERP</title>

      {/* Header */}
      <div className="page-header">
        <div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {products.length} products in catalog
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          disabled={!canManage}
          className="w-full gap-2 shadow-sm shadow-primary/20 sm:w-auto"
        >
          {!canManage ? (
            <Lock size={15} weight="bold" />
          ) : (
            <Plus size={15} weight="bold" />
          )}{" "}
          Add Product
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="stat-card">
          <p className="text-xs font-medium text-muted-foreground">
            Total Products
          </p>
          <p className="font-heading text-2xl font-bold">{products.length}</p>
          <p className="text-[11px] text-muted-foreground">In catalog</p>
        </div>
        <div
          className={cn(
            "stat-card",
            lowStock.length > 0 && "border-amber-500/30 bg-amber-500/5"
          )}
        >
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            {lowStock.length > 0 ? (
              <Warning size={11} className="text-amber-500" weight="fill" />
            ) : (
              <CheckCircle
                size={11}
                className="text-emerald-500"
                weight="fill"
              />
            )}
            Low Stock
          </p>
          <p
            className={cn(
              "font-heading text-2xl font-bold",
              lowStock.length > 0 ? "text-amber-500" : "text-emerald-500"
            )}
          >
            {lowStock.length}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Products below 10 units
          </p>
        </div>
        <div className="stat-card">
          <p className="text-xs font-medium text-muted-foreground">
            Stock Value
          </p>
          <p className="font-heading text-2xl font-bold">
            {formatINR(totalValue)}
          </p>
          <p className="text-[11px] text-muted-foreground">At selling price</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search by name or SKU..."
          className="w-full rounded-lg border border-input bg-card px-4 py-2.5 pr-10 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none"
        />
        {search && (
          <button
            onClick={() => { setSearch(""); setPage(1) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
          >
            <X size={16} weight="bold" />
          </button>
        )}
      </div>

      {/* Products table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="table-header-row">
              <TableHead className="w-16 text-xs font-semibold">
                Image
              </TableHead>
              <TableHead className="text-xs font-semibold">Product</TableHead>
              <TableHead className="text-xs font-semibold">SKU</TableHead>
              <TableHead className="text-xs font-semibold">Price</TableHead>
              <TableHead className="text-xs font-semibold">In Stock</TableHead>
              <TableHead className="text-xs font-semibold">
                Stock Value
              </TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-right text-xs font-semibold">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(8)].map((_, j) => (
                    <TableCell key={j}>
                      <div className="shimmer h-4 rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading && filteredProducts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-20 text-center text-muted-foreground"
                >
                  <Package size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No products yet</p>
                  <p className="mt-1 text-sm">
                    Add your first product to start managing stock
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pagedProducts.map((p) => {
                const isLow = p.currentStock < 10
                const pct = Math.min(
                  100,
                  (p.currentStock / Math.max(1, 100)) * 100
                )
                return (
                  <TableRow
                    key={p.id}
                    className={cn(
                      "transition-colors hover:bg-muted/20",
                      isLow && "bg-amber-500/3"
                    )}
                  >
                    <TableCell>
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                        <Package size={20} className="text-muted-foreground/40" />
                        {p.imageUrl && (
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = "none" }}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] font-medium text-foreground">
                      {p.name}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {p.sku || "—"}
                    </TableCell>
                    <TableCell className="text-[13px] font-bold">
                      {formatINR(p.price)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span
                          className={cn(
                            "text-sm font-bold",
                            isLow ? "text-amber-500" : "text-emerald-500"
                          )}
                        >
                          {p.currentStock} {p.unitOfMeasure}
                        </span>
                        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              isLow ? "bg-amber-500" : "bg-emerald-500"
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] font-semibold">
                      {formatINR(p.currentStock * p.price)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "badge-status",
                          isLow
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-emerald-500/15 text-emerald-500"
                        )}
                      >
                        {isLow ? "⚠ Low Stock" : "✓ In Stock"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => router.push(`/products/${p.id}`)}
                        >
                          <Eye size={14} /> View
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => openEdit(p)}
                            >
                              <PencilSimple size={14} /> Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => {
                                setStockDialog(p)
                                setStockQty(0)
                                setStockInvoiceDetails("")
                              }}
                            >
                              <ArrowUp size={12} weight="bold" /> Restock
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && filteredProducts.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredProducts.length)} of {filteredProducts.length} products
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-muted-foreground font-medium">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ── Add Product Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Package size={18} className="text-primary" /> Add New Product
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Product Name *
              </label>
              <input
                value={addForm.name}
                onChange={(e) =>
                  setAddForm({ ...addForm, name: e.target.value })
                }
                placeholder="e.g. Classic White Shirt"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                SKU (optional)
              </label>
              <input
                value={addForm.sku}
                onChange={(e) =>
                  setAddForm({ ...addForm, sku: e.target.value })
                }
                placeholder="e.g. SHT-WHT-001 (auto-generated if blank)"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Selling Price (₹) *
                </label>
                <input
                  type="number"
                  min={0}
                  value={addForm.price}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Unit
                </label>
                <select
                  value={addForm.unitOfMeasure}
                  onChange={(e) =>
                    setAddForm({ ...addForm, unitOfMeasure: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="pcs">pcs (pieces)</option>
                  <option value="units">units</option>
                  <option value="sets">sets</option>
                  <option value="boxes">boxes</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Starting Stock
                </label>
                <input
                  type="number"
                  min={0}
                  value={addForm.startingStock}
                  onChange={(e) =>
                    setAddForm({
                      ...addForm,
                      startingStock: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold text-emerald-600"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Product Image
                </label>
                <div className="flex items-center gap-3">
                  {addForm.imageUrl ? (
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded border">
                      <img
                        src={addForm.imageUrl}
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddProduct}
              disabled={!addForm.name.trim() || addForm.price <= 0 || saving}
            >
              {saving && <Spinner size={14} className="mr-1 animate-spin" />}
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Product Dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={!!editDialog}
        onOpenChange={(o) => !o && setEditDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <PencilSimple size={18} className="text-primary" /> Edit Product
            </DialogTitle>
          </DialogHeader>
          {editDialog && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-muted-foreground">
                Stock:{" "}
                <span className="font-bold text-foreground">
                  {editDialog.currentStock} {editDialog.unitOfMeasure}
                </span>
                {" · "}use Restock to change quantity
              </p>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Product Name *
                </label>
                <input
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  SKU
                </label>
                <input
                  value={editForm.sku}
                  onChange={(e) =>
                    setEditForm({ ...editForm, sku: e.target.value })
                  }
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.price}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Unit
                  </label>
                  <select
                    value={editForm.unitOfMeasure}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        unitOfMeasure: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="pcs">pcs</option>
                    <option value="units">units</option>
                    <option value="sets">sets</option>
                    <option value="boxes">boxes</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Image
                </label>
                <div className="flex items-center gap-3">
                  {editForm.imageUrl ? (
                    <img
                      src={editForm.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded border object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded border bg-muted">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageUpload}
                    disabled={uploadingImage}
                    className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditProduct}
              disabled={saving || !editForm.name.trim() || editForm.price <= 0}
            >
              {saving && <Spinner size={14} className="mr-1 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Stock Dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={!!stockDialog}
        onOpenChange={(o) => !o && setStockDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <ArrowUp size={18} className="text-emerald-500" weight="bold" />{" "}
              Restock
            </DialogTitle>
          </DialogHeader>
          {stockDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">{stockDialog.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Current stock:{" "}
                  <span
                    className={cn(
                      "font-bold",
                      stockDialog.currentStock < 10
                        ? "text-amber-500"
                        : "text-emerald-500"
                    )}
                  >
                    {stockDialog.currentStock} {stockDialog.unitOfMeasure}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Quantity to Add *
                </label>
                <input
                  type="number"
                  min={1}
                  value={stockQty || ""}
                  onChange={(e) => setStockQty(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 50"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Invoice Details{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  value={stockInvoiceDetails}
                  onChange={(e) => setStockInvoiceDetails(e.target.value)}
                  placeholder="e.g. INV-1234 from Supplier"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              {stockQty > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">
                    New stock level will be
                  </span>
                  <span className="font-bold text-emerald-500">
                    {stockDialog.currentStock + stockQty}{" "}
                    {stockDialog.unitOfMeasure}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStock}
              disabled={stockQty <= 0 || saving}
              className="gap-1.5 border-0 bg-emerald-600 text-white hover:bg-emerald-700"
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
