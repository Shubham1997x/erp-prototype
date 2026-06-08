"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Package, ArrowLeft, Warning, CheckCircle, Spinner, ArrowUp, PencilSimple } from "@phosphor-icons/react"
import type { Product } from "@/lib/types"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { notifyNotificationsChanged } from "@/components/providers/notification-provider"
import { restockToastMessage, type StockAdjustResponse } from "@/lib/stock-restock"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

export default function ProductDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { user: currentUser } = useUser()
  const { data: product, loading, error, refetch } = useFetch<Product>(`/api/products/${id}`)

  const canManage =
    !currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager"

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    name: "",
    sku: "",
    price: 0,
    unitOfMeasure: "pcs",
    imageUrl: "",
    category: "",
    standardCost: 0,
    unitCost: 0,
    isActive: true,
  })
  const [stockOpen, setStockOpen] = useState(false)
  const [stockQty, setStockQty] = useState(0)
  const [stockInvoiceDetails, setStockInvoiceDetails] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  function openEdit() {
    if (!product) return
    setEditForm({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price,
      unitOfMeasure: product.unitOfMeasure ?? "pcs",
      imageUrl: product.imageUrl ?? "",
      category: product.category ?? "",
      standardCost: product.standardCost ?? 0,
      unitCost: product.unitCost ?? 0,
      isActive: product.isActive !== false,
    })
    setEditOpen(true)
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleSaveEdit() {
    if (!product) return
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
      await apiPatch(`/api/products/${product.id}`, editForm)
      toast.success("Product updated")
      setEditOpen(false)
      refetch()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update product")
    } finally {
      setSaving(false)
    }
  }

  async function handleRestock() {
    if (!product || stockQty <= 0) {
      toast.error("Enter a quantity greater than 0")
      return
    }
    setSaving(true)
    try {
      const result = await apiPost<StockAdjustResponse>("/api/stock", {
        entityType: "product",
        entityId: product.id,
        delta: stockQty,
        reason: stockInvoiceDetails.trim()
          ? `Restock — ${stockInvoiceDetails.trim()}`
          : "Manual restock",
      })
      toast.success(restockToastMessage(stockQty, product.name, result.autoFulfilledOrders))
      if (result.autoFulfilledOrders?.length) notifyNotificationsChanged()
      setStockOpen(false)
      setStockQty(0)
      setStockInvoiceDetails("")
      refetch()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Restock failed")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-1/3 bg-muted rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 aspect-square bg-muted rounded-xl"></div>
          <div className="md:col-span-2 space-y-4">
            <div className="h-6 w-1/2 bg-muted rounded"></div>
            <div className="h-6 w-1/4 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="p-6 text-center text-muted-foreground mt-20">
        <h2 className="text-xl font-bold mb-2 text-foreground">Product not found</h2>
        <p>The product you are looking for does not exist or has been removed.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/products")}>
          <ArrowLeft size={16} className="mr-2" /> Back to Products
        </Button>
      </div>
    )
  }

  const isLow = product.currentStock < 10

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <title>{product.name} | ShirtCo ERP</title>

      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.push("/products")}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{product.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{product.sku}</p>
        </div>
        <span
          className={cn(
            "badge-status px-3 py-1 text-sm font-semibold",
            isLow ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
          )}
        >
          {isLow ? (
            <Warning size={16} className="mr-1 inline-block" />
          ) : (
            <CheckCircle size={16} className="mr-1 inline-block" />
          )}
          {isLow ? "Low Stock" : "In Stock"}
        </span>
        {canManage && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" className="gap-2" onClick={openEdit}>
              <PencilSimple size={16} /> Edit
            </Button>
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                setStockQty(0)
                setStockInvoiceDetails("")
                setStockOpen(true)
              }}
            >
              <ArrowUp size={16} weight="bold" /> Restock
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="aspect-square rounded-2xl border bg-card shadow-sm overflow-hidden flex items-center justify-center p-2 relative">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover rounded-xl"
                onError={(e) => {
                  const t = e.currentTarget
                  t.style.display = "none"
                  t.parentElement?.querySelector(".img-fallback")?.removeAttribute("hidden")
                }}
              />
            ) : null}
            <Package size={80} className="img-fallback text-muted-foreground/30" hidden={!!product.imageUrl} />
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Selling Price</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatINR(product.price)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Unit</p>
              <p className="text-2xl font-bold text-foreground mt-1">{product.unitOfMeasure}</p>
            </div>
            <div className="stat-card border-emerald-500/30 bg-emerald-500/5">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Available Stock</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{product.currentStock}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reserved Stock</p>
              <p className="text-2xl font-bold text-foreground mt-1">{product.reservedStock || 0}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg mb-4">Product Information</h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{product.category || "Uncategorized"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Standard Cost</p>
                <p className="font-medium">{product.standardCost ? formatINR(product.standardCost) : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Unit Cost</p>
                <p className="font-medium">{product.unitCost ? formatINR(product.unitCost) : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{product.isActive === false ? "Inactive" : "Active"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <PencilSimple size={18} className="text-primary" /> Edit Product
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Stock: <span className="font-bold text-foreground">{product.currentStock} {product.unitOfMeasure}</span>
              {" · "}use Restock to change quantity
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Product Name *</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</label>
              <input
                value={editForm.sku}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price (₹) *</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit</label>
                <select
                  value={editForm.unitOfMeasure}
                  onChange={(e) => setEditForm({ ...editForm, unitOfMeasure: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="pcs">pcs</option>
                  <option value="units">units</option>
                  <option value="sets">sets</option>
                  <option value="boxes">boxes</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Standard Cost (₹)</label>
                <input
                  type="number" min={0}
                  value={editForm.standardCost || ""}
                  onChange={(e) => setEditForm({ ...editForm, standardCost: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit Cost (₹)</label>
                <input
                  type="number" min={0}
                  value={editForm.unitCost || ""}
                  onChange={(e) => setEditForm({ ...editForm, unitCost: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
                <input
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</label>
                <select
                  value={editForm.isActive ? "true" : "false"}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "true" })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleEditImageUpload}
                disabled={uploadingImage}
                className="w-full text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.name.trim() || editForm.price <= 0}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stockOpen} onOpenChange={setStockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ArrowUp size={18} className="text-emerald-500" weight="bold" /> Restock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">
              <span className="font-semibold">{product.name}</span>
              <span className="text-muted-foreground"> · current {product.currentStock} {product.unitOfMeasure}</span>
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quantity to add *</label>
              <input
                type="number"
                min={1}
                value={stockQty || ""}
                onChange={(e) => setStockQty(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice / source (optional)</label>
              <input
                value={stockInvoiceDetails}
                onChange={(e) => setStockInvoiceDetails(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="PO number, supplier invoice…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRestock}
              disabled={saving || stockQty <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              Add stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
