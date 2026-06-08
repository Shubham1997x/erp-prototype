"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type { Customer, Product, SalesOrderLine } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  ArrowLeft, 
  Plus, 
  Trash, 
  ShoppingCart, 
  Spinner, 
  Package, 
  Warning,
  User,
  Envelope,
  Phone,
  MagnifyingGlass,
  CheckCircle,
  FileText,
  TShirt
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getCompanyImageUrl } from "@/lib/avatar-utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v)
}

const GST_RATES = [0, 5, 12, 18]

interface LineItem extends Omit<SalesOrderLine, "gstRate"> {
  gstRate?: number
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
}

export default function NewOrderPage() {
  const router = useRouter()
  const { isSales, isAdmin } = useUser()

  const customersRes = useFetch<Customer[] | PaginatedResponse<Customer>>("/api/customers")
  const productsRes = useFetch<Product[] | PaginatedResponse<Product>>("/api/products")

  function unwrap<T>(res: PaginatedResponse<T> | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as PaginatedResponse<T>).data)) return (res as PaginatedResponse<T>).data
    return []
  }

  const allCustomers = unwrap(customersRes.data)
  const allProducts = unwrap(productsRes.data)

  const [customerId, setCustomerId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([
    { productId: "", qty: 1, unitPrice: 0, gstRate: undefined },
  ])
  const [saving, setSaving] = useState(false)
  
  // Catalog search state
  const [searchQuery, setSearchQuery] = useState("")

  const canCreate = isSales || isAdmin

  const selectedCustomer = allCustomers.find((c) => c.id === customerId)
  const hasProducts = lines.some((l) => l.productId)

  // Filter products for the quick-add gallery based on search
  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return allProducts.slice(0, 6) // Show top 6 in the sidebar
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [allProducts, searchQuery])

  function updateLine(idx: number, field: keyof LineItem, value: string | number | undefined) {
    setLines((prev) => {
      const next = [...prev]
      if (field === "productId") {
        const prod = allProducts.find((p) => p.id === value)
        next[idx] = { 
          ...next[idx], 
          productId: value as string, 
          unitPrice: prod?.price ?? 0 
        }
      } else {
        next[idx] = { ...next[idx], [field]: value }
      }
      return next
    })
  }

  function addLine(prodId: string = "") {
    const prod = allProducts.find((p) => p.id === prodId)
    const price = prod?.price ?? 0
    
    // Check if product is already in the list
    const existsIdx = lines.findIndex(l => l.productId === prodId)
    if (prodId && existsIdx > -1) {
      // Just increment quantity
      setLines(prev => {
        const next = [...prev]
        next[existsIdx].qty += 1
        return next
      })
      toast.info(`Increased quantity of ${prod?.name}`)
      return
    }

    // Replace the first empty line if it exists
    const emptyIdx = lines.findIndex(l => !l.productId)
    if (emptyIdx > -1 && prodId) {
      updateLine(emptyIdx, "productId", prodId)
      return
    }

    setLines((l) => [...l, { productId: prodId, qty: 1, unitPrice: price, gstRate: undefined }])
    if (prod) toast.success(`Added ${prod.name} to order`)
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx))
  }

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines]
  )
  const taxTotal = useMemo(
    () => lines.reduce((s, l) => s + (l.qty * l.unitPrice * (l.gstRate ?? 0)) / 100, 0),
    [lines]
  )
  const grandTotal = subtotal + taxTotal

  async function handleCreate(submitAsDraft = false) {
    if (!customerId) {
      toast.error("Please select a customer account")
      const el = document.getElementById("customer-select")
      if (el) {
        el.focus()
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }
    if (lines.length === 0) {
      toast.error("Please add at least one custom item / line")
      return
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.productId) {
        toast.error(`Please select a shirt product for line item ${i + 1}`)
        const el = document.getElementById(`product-select-${i}`)
        if (el) {
          el.focus()
          el.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        return
      }
      if (line.qty <= 0) {
        toast.error(`Quantity for line item ${i + 1} must be greater than zero`)
        const el = document.getElementById(`qty-input-${i}`)
        if (el) {
          el.focus()
          el.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        return
      }
      if (line.gstRate === undefined) {
        toast.error(`Please select a GST % rate for line item ${i + 1}`)
        const el = document.getElementById(`gst-select-${i}`)
        if (el) {
          el.focus()
          el.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        return
      }
    }

    setSaving(true)
    try {
      const order = await apiPost("/api/sales-orders", {
        customerId,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
        })),
        status: submitAsDraft ? "DRAFT" : "SUBMITTED",
      })
      toast.success(submitAsDraft ? "Order saved as draft" : "Order submitted successfully")
      router.push(`/orders/${(order as { id: string }).id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground p-6">
        <div className="text-center max-w-sm">
          <Warning className="mx-auto mb-3 size-12 text-destructive opacity-80" />
          <p className="font-semibold text-lg text-foreground">Access Denied</p>
          <p className="mt-1.5 text-sm text-muted-foreground">Only Sales Executives or Administrators can create sales orders.</p>
          <Button onClick={() => router.back()} className="mt-4 gap-2" variant="outline">
            <ArrowLeft className="size-4" /> Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full space-y-6 p-4 sm:p-6 sm:px-8 lg:px-10">
      <title>New Order | ShirtCo ERP</title>

      {/* Workspace split layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start pt-2">
        
        {/* Left side: Main Editor Workspace (8 Cols) */}
        <div className="space-y-6 lg:col-span-8">
          
          {/* Minimal Customer Selection Row */}
          <div className="rounded-xl border border-border/40 bg-card p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              {selectedCustomer ? (
                <img
                  src={getCompanyImageUrl(selectedCustomer.id)}
                  alt={selectedCustomer.name}
                  className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-border/60 object-cover"
                />
              ) : (
                <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-full border border-dashed border-border bg-muted/30">
                  <User className="size-4.5 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="customer-select" className="w-full rounded-lg h-9 text-xs font-medium border-border bg-background">
                    <SelectValue placeholder="— Select Customer Account —" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.contact ? `(${c.contact})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedCustomer && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 text-muted-foreground">
                  Terms: <strong className="text-foreground font-semibold">{selectedCustomer.paymentTerms}</strong>
                </span>
                <span className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 text-muted-foreground">
                  Limit: <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{formatINR(selectedCustomer.creditLimit ?? 0)}</strong>
                </span>
                <span className="px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 text-muted-foreground">
                  Contact: <strong className="text-foreground font-semibold">{selectedCustomer.contact || "N/A"}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Selected Order Lines (Spacious layout, wide rows) */}
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <ShoppingCart className="size-4 text-primary" />
                Selected Order Lines
              </CardTitle>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {lines.length} Line item{lines.length !== 1 ? "s" : ""}
              </span>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="space-y-3">
                {lines.map((line, idx) => {
                  const prod = allProducts.find((p) => p.id === line.productId)
                  const lineTotal = line.qty * line.unitPrice
                  const lineTax = (lineTotal * (line.gstRate ?? 0)) / 100
                  const isStockDeficit = prod ? (line.qty > (prod.currentStock - prod.reservedStock)) : false

                  return (
                    <div
                      key={idx}
                      className={cn(
                        "rounded-xl border border-border/60 bg-muted/40 p-4 space-y-3.5 transition-colors relative overflow-hidden",
                        isStockDeficit && "border-amber-500/30 bg-amber-500/5"
                      )}
                    >
                      {/* Top row: Product Dropdown Selection & Image */}
                      <div className="flex items-start gap-3.5">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border bg-muted/30 flex items-center justify-center relative">
                          {prod?.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.name} className="h-full w-full object-cover" />
                          ) : (
                            <Package className="size-5 text-muted-foreground/30" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Select
                            value={line.productId || ""}
                            onValueChange={(v) => updateLine(idx, "productId", v)}
                          >
                            <SelectTrigger id={`product-select-${idx}`} className="w-full rounded-xl border-border bg-background text-sm">
                              <SelectValue placeholder="— Select Shirt Product —" />
                            </SelectTrigger>
                            <SelectContent>
                              {allProducts.map((p) => {
                                const usedElsewhere = lines.some((l, i) => i !== idx && l.productId === p.id)
                                return (
                                  <SelectItem key={p.id} value={p.id} disabled={usedElsewhere}>
                                    {p.name} (SKU: {p.sku}) — {formatINR(p.price)}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>

                          {prod && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-medium">
                              <span>SKU: <strong className="font-semibold text-foreground">{prod.sku}</strong></span>
                              <span>•</span>
                              <span>Available Stock: <strong className={cn("font-semibold", isStockDeficit ? "text-amber-500" : "text-emerald-500")}>
                                {prod.currentStock - prod.reservedStock} pcs
                              </strong> (Total: {prod.currentStock})</span>
                            </div>
                          )}
                        </div>

                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="mt-1 p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                          >
                            <Trash className="size-4" />
                          </button>
                        )}
                      </div>

                      {/* Middle row: Quantity adjustments / unit price / tax rate */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Order Quantity</label>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => updateLine(idx, "qty", Math.max(1, line.qty - 1))}
                              className="px-2.5 py-1.5 border border-border rounded-l-xl bg-background hover:bg-muted font-bold text-xs text-foreground"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              id={`qty-input-${idx}`}
                              onChange={(e) => updateLine(idx, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full border-y border-border bg-background py-1 text-center text-sm font-bold focus:outline-none text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateLine(idx, "qty", line.qty + 1)}
                              className="px-2.5 py-1.5 border border-border rounded-r-xl bg-background hover:bg-muted font-bold text-xs text-foreground"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit Price (₹)</label>
                          <Input
                            type="number"
                            min={0}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="rounded-xl text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">GST % Rate</label>
                          <Select
                            value={line.gstRate !== undefined ? String(line.gstRate) : ""}
                            onValueChange={(v) => updateLine(idx, "gstRate", v === "" ? undefined : parseFloat(v))}
                          >
                            <SelectTrigger id={`gst-select-${idx}`} className="w-full rounded-xl border-border bg-background text-sm">
                              <SelectValue placeholder="— Select GST % —" />
                            </SelectTrigger>
                            <SelectContent>
                              {GST_RATES.map((r) => (
                                <SelectItem key={r} value={String(r)}>{r}% GST</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Stock deficiency warnings */}
                      {isStockDeficit && (
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-500/15 px-3 py-2 rounded-xl text-xs font-semibold">
                          <Warning className="size-4 shrink-0" />
                          <span>Stock Warning: Order quantity exceeds currently available shirt stock. This will trigger a manufacturing restock hold.</span>
                        </div>
                      )}

                      {/* Bottom line summary calculator display */}
                      {lineTotal > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-background/80 border border-border/40 px-3.5 py-2 text-xs font-medium text-muted-foreground">
                          <div className="space-x-1">
                            <span>Sub:</span>
                            <strong className="text-foreground">{formatINR(lineTotal)}</strong>
                          </div>
                          <div className="space-x-1">
                            <span>GST:</span>
                            <strong className="text-foreground">{line.gstRate !== undefined ? formatINR(lineTax) : "—"}</strong>
                          </div>
                          <div className="space-x-1">
                            <span className="font-bold text-primary">Line Total:</span>
                            <strong className="text-foreground font-bold">{formatINR(lineTotal + (line.gstRate !== undefined ? lineTax : 0))}</strong>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <Button
                variant="outline"
                className="w-full py-5 rounded-xl border-dashed border-2 text-xs font-bold gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => addLine("")}
              >
                <Plus className="size-3.5" /> Add Custom Item / Line
              </Button>
            </CardContent>
          </Card>

          {/* Card 3: Additional Notes */}
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <FileText className="size-4 text-primary" />
                Additional Order Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Specify special packaging, customized shirt stitchings, dispatch priority, or shipping instructions..."
                rows={2}
                className="w-full rounded-xl resize-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right side: Sticky helper sidebar (4 Cols) */}
        <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-6">
          
          {/* Card 4: Visual Catalog Quick Adder (Compact right-side widget) */}
          <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
              <div className="space-y-2">
                <CardTitle className="text-xs font-extrabold flex items-center gap-1.5 text-foreground uppercase tracking-wider">
                  <Package className="size-3.5 text-primary" />
                  Catalog Quick Adder
                </CardTitle>
                <div className="relative w-full">
                  <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search shirts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8.5 h-8 text-xs rounded-lg"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {filteredCatalog.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No matching shirts found
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {filteredCatalog.map(p => {
                    const isRestockNeeded = p.currentStock <= p.reservedStock
                    return (
                      <div 
                        key={p.id} 
                        onClick={() => addLine(p.id)}
                        className="group relative cursor-pointer rounded-lg border border-border/40 bg-card p-2 hover:border-primary/30 hover:shadow transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-1">
                          <div className="h-16 w-full bg-muted/30 rounded overflow-hidden border border-border/30 flex items-center justify-center relative">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                            ) : (
                              <TShirt className="size-5 text-muted-foreground/30" />
                            )}
                            <span className={cn(
                              "absolute bottom-0.5 right-0.5 px-1 rounded text-[8px] font-bold shadow-sm",
                              isRestockNeeded ? "bg-amber-500/90 text-white" : "bg-emerald-500/90 text-white"
                            )}>
                              {isRestockNeeded ? "Out" : `${p.currentStock}`}
                            </span>
                          </div>
                          <div>
                            <div className="text-[10px] font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">{p.name}</div>
                            <div className="text-[8px] text-muted-foreground font-mono">SKU: {p.sku}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/20">
                          <span className="text-[10px] font-extrabold text-foreground">{formatINR(p.price)}</span>
                          <span className="text-[8px] text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            + Add
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 5: Live Receipt Widget (Populates only when products are added) */}
          {hasProducts ? (
            <div className="bg-card border-border/60 shadow-lg rounded-2xl overflow-hidden relative border animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Top color accent strip */}
              <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
              
              <div className="p-5 space-y-5">
                <h3 className="font-heading text-sm font-bold flex items-center gap-2 border-b pb-3">
                  <ShoppingCart className="size-4 text-primary" />
                  Live Invoice Summary
                </h3>

                <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                  {lines
                    .filter((l) => l.productId)
                    .map((l, idx) => {
                      const prod = allProducts.find((p) => p.id === l.productId)
                      return (
                        <div key={idx} className="flex justify-between items-start text-xs gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-foreground truncate">{prod?.name || "Loading..."}</div>
                            <div className="text-muted-foreground text-[10px] mt-0.5">Qty: {l.qty} × {formatINR(l.unitPrice)}</div>
                          </div>
                          <span className="font-bold text-foreground shrink-0">{formatINR(l.qty * l.unitPrice)}</span>
                        </div>
                      )
                    })}
                </div>

                {/* Receipt Dotted line divider */}
                <div className="border-t border-dashed border-border/60 my-2" />

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-semibold text-foreground">{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>GST/Taxes Collected</span>
                    <span className="font-semibold text-foreground">{formatINR(taxTotal)}</span>
                  </div>
                  
                  <div className="border-t border-border/50 pt-2.5 flex justify-between items-baseline">
                    <span className="font-bold text-foreground">Grand Total</span>
                    <span className="font-extrabold text-lg text-primary">{formatINR(grandTotal)}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-3 border-t border-border/30">
                  <Button
                    className="w-full h-11 rounded-xl font-bold shadow-md shadow-primary/10 hover:shadow-primary/20 gap-2 transition-all bg-primary text-primary-foreground hover:bg-primary border-none"
                    disabled={saving}
                    onClick={() => handleCreate(true)}
                  >
                    {saving ? (
                      <Spinner className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle className="size-4" />
                    )}
                    Create Draft Order
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full text-xs text-muted-foreground font-semibold hover:text-destructive"
                    onClick={() => router.back()}
                  >
                    Discard Changes
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-2xl bg-card p-4">
              Add products to generate live invoice calculations
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
