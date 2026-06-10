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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash,
  ShoppingCart,
  Spinner,
  Package,
  Warning,
  User,
  MagnifyingGlass,
  CheckCircle,
  FileText,
  TShirt,
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

const STEPS = [
  { label: "Customer", icon: User, description: "Select the customer account" },
  { label: "Products", icon: Package, description: "Add items to the order" },
  { label: "Review", icon: FileText, description: "Review and submit" },
]

interface CustomerForm {
  name: string
  contact: string
  email: string
  address: string
  creditLimit: number
  paymentTerms: string
}

const emptyForm: CustomerForm = {
  name: "",
  contact: "",
  email: "",
  address: "",
  creditLimit: 0,
  paymentTerms: "Net 30",
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

  const allCustomers = useMemo(() => unwrap(customersRes.data), [customersRes.data])
  const allProducts = useMemo(() => unwrap(productsRes.data), [productsRes.data])

  const [step, setStep] = useState(0)
  const [customerId, setCustomerId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([
    { productId: "", qty: 1, unitPrice: 0, gstRate: undefined },
  ])
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // New Customer Modal State
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState<CustomerForm>(emptyForm)
  const [savingCustomer, setSavingCustomer] = useState(false)

  const canCreate = isSales || isAdmin
  const selectedCustomer = allCustomers.find((c) => c.id === customerId)
  const hasProducts = lines.some((l) => l.productId)

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return allProducts.slice(0, 6)
    return allProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 6)
  }, [allProducts, searchQuery])

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), [lines])
  const taxTotal = useMemo(
    () => lines.reduce((s, l) => s + (l.qty * l.unitPrice * (l.gstRate ?? 0)) / 100, 0),
    [lines]
  )
  const grandTotal = subtotal + taxTotal

  function updateLine(idx: number, field: keyof LineItem, value: string | number | undefined) {
    setLines((prev) => {
      const next = [...prev]
      if (field === "productId") {
        const prod = allProducts.find((p) => p.id === value)
        next[idx] = { ...next[idx], productId: value as string, unitPrice: prod?.price ?? 0 }
      } else {
        next[idx] = { ...next[idx], [field]: value }
      }
      return next
    })
  }

  function focusField(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.focus()
    el.classList.add("!ring-2", "!ring-destructive", "!border-destructive")
    setTimeout(() => el.classList.remove("!ring-2", "!ring-destructive", "!border-destructive"), 2000)
  }

  function addLine(prodId: string = "") {
    const prod = allProducts.find((p) => p.id === prodId)
    const existsIdx = lines.findIndex((l) => l.productId === prodId)
    if (prodId && existsIdx > -1) {
      setLines((prev) => prev.map((l, i) => (i === existsIdx ? { ...l, qty: l.qty + 1 } : l)))
      toast.info(`Increased quantity of ${prod?.name}`)
      return
    }
    const emptyIdx = lines.findIndex((l) => !l.productId)
    if (emptyIdx > -1 && prodId) {
      updateLine(emptyIdx, "productId", prodId)
      return
    }
    setLines((l) => [...l, { productId: prodId, qty: 1, unitPrice: prod?.price ?? 0, gstRate: undefined }])
    if (prod) toast.success(`Added ${prod.name} to order`)
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx))
  }

  function goNext() {
    if (step === 0 && !customerId) {
      toast.error("Please select a customer account")
      focusField("customer-select")
      return
    }
    if (step === 1) {
      const validLines = lines.filter((l) => l.productId)
      if (validLines.length === 0) {
        toast.error("Please add at least one product")
        return
      }
      // Check GST on every filled line
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        if (!l.productId) continue
        if (l.gstRate === undefined || l.gstRate === null) {
          toast.error(`Select a GST rate for line item ${i + 1}`)
          focusField(`gst-select-${i}`)
          return
        }
      }
      // Remove empty lines before proceeding
      const emptyLine = lines.findIndex((l) => !l.productId)
      if (emptyLine > -1) setLines((prev) => prev.filter((l) => l.productId))
    }
    setStep((s) => s + 1)
  }

  function goBack() {
    setStep((s) => s - 1)
  }

  async function handleCreate(submitAsDraft = false) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line.productId) continue
      if (line.qty <= 0) {
        toast.error(`Quantity for line item ${i + 1} must be greater than zero`)
        setStep(1)
        return
      }
      if (line.gstRate === undefined || line.gstRate === null) {
        toast.error(`Please select a GST % rate for line item ${i + 1}`)
        setStep(1)
        return
      }
    }

    setSaving(true)
    try {
      const order = await apiPost("/api/sales-orders", {
        customerId,
        notes: notes.trim() || undefined,
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({
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

  async function handleCreateCustomer() {
    if (!newCustomerForm.name.trim()) {
      toast.error("Company name is required")
      return
    }
    setSavingCustomer(true)
    try {
      const newCust = await apiPost("/api/customers", newCustomerForm)
      toast.success("Customer added")
      setShowNewCustomer(false)
      customersRes.refetch()
      if (newCust && (newCust as any).id) {
        setCustomerId((newCust as any).id)
      }
      setNewCustomerForm(emptyForm)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save customer")
    } finally {
      setSavingCustomer(false)
    }
  }

  if (!canCreate) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <Warning className="mx-auto mb-3 size-12 text-destructive opacity-80" />
          <p className="font-semibold text-lg text-foreground">Access Denied</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Only Sales Executives or Administrators can create sales orders.
          </p>
          <Button onClick={() => router.back()} className="mt-4 gap-2" variant="outline">
            <ArrowLeft className="size-4" /> Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full space-y-6 p-4 sm:p-6 sm:px-8">
      <title>New Order | ShirtCo ERP</title>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" /> Orders
        </Button>
        <span className="text-muted-foreground/40">/</span>
        <h1 className="text-sm font-semibold text-foreground">New Sales Order</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const isActive = i === step
          const isDone = i < step
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle className="size-4" weight="fill" /> : <Icon className="size-3.5" />}
                </div>
                <div className="hidden sm:block">
                  <div
                    className={cn(
                      "text-xs font-bold leading-tight",
                      isActive ? "text-foreground" : isDone ? "text-muted-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 leading-tight">{s.description}</div>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "mx-3 h-px flex-1 transition-colors",
                    i < step ? "bg-primary" : "bg-border/60"
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[360px]">

        {/* ── Step 0: Customer ── */}
        {step === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
            <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  Select Customer Account
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center gap-4">
                  {selectedCustomer ? (
                    <img
                      src={getCompanyImageUrl(selectedCustomer.id)}
                      alt={selectedCustomer.name}
                      className="h-14 w-14 shrink-0 rounded-full border border-border/60 object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 flex items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/30">
                      <User className="size-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 flex gap-2">
                    <div className="flex-1">
                      <Select value={customerId} onValueChange={setCustomerId}>
                        <SelectTrigger id="customer-select" className="w-full h-9 font-medium">
                          <SelectValue placeholder="— Select a Customer —" />
                        </SelectTrigger>
                        <SelectContent>
                          {allCustomers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.contact ? `(${c.contact})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!selectedCustomer && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Choose the customer this order is being placed for.
                        </p>
                      )}
                    </div>
                    <Button
                      className="h-9 gap-1.5 shrink-0 px-3 shadow-sm"
                      onClick={() => setShowNewCustomer(true)}
                    >
                      <Plus className="size-3.5" />
                      <span className="hidden sm:inline">New Customer</span>
                      <span className="sm:hidden">New</span>
                    </Button>
                  </div>
                </div>

                {selectedCustomer && (
                  <div className="rounded-xl border border-border/40 bg-muted/30 p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="font-semibold text-sm text-foreground">{selectedCustomer.name}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Payment Terms</div>
                        <div className="font-semibold text-foreground">{selectedCustomer.paymentTerms}</div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Credit Limit</div>
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">{formatINR(selectedCustomer.creditLimit ?? 0)}</div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-muted-foreground uppercase tracking-wider text-[10px] font-bold">Contact</div>
                        <div className="font-semibold text-foreground">{selectedCustomer.contact || "—"}</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 1: Products ── */}
        {step === 1 && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 animate-in fade-in slide-in-from-right-4 duration-200">

            {/* Order Lines */}
            <div className="lg:col-span-7 space-y-4">
              <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ShoppingCart className="size-4 text-primary" />
                    Order Lines
                  </CardTitle>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {lines.filter((l) => l.productId).length} item{lines.filter((l) => l.productId).length !== 1 ? "s" : ""}
                  </span>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {lines.map((line, idx) => {
                    const prod = allProducts.find((p) => p.id === line.productId)
                    const lineTotal = line.qty * line.unitPrice
                    const lineTax = (lineTotal * (line.gstRate ?? 0)) / 100
                    const isStockDeficit = prod ? line.qty > prod.currentStock - prod.reservedStock : false

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "rounded-xl border border-border/60 bg-muted/40 p-4 space-y-3 transition-colors",
                          isStockDeficit && "border-amber-500/30 bg-amber-500/5"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 shrink-0 rounded-xl border bg-muted/30 flex items-center justify-center relative overflow-hidden">
                            <Package className="size-4 text-muted-foreground/30" />
                            {prod?.imageUrl && (
                              <img
                                src={prod.imageUrl}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = "none" }}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <Select
                              value={line.productId || ""}
                              onValueChange={(v) => updateLine(idx, "productId", v)}
                            >
                              <SelectTrigger id={`product-select-${idx}`} className="w-full text-sm">
                                <SelectValue placeholder="— Select Shirt Product —" />
                              </SelectTrigger>
                              <SelectContent>
                                {allProducts.map((p) => {
                                  const usedElsewhere = lines.some((l, i) => i !== idx && l.productId === p.id)
                                  return (
                                    <SelectItem key={p.id} value={p.id} disabled={usedElsewhere}>
                                      {p.name} — {formatINR(p.price)} · Stock: {Math.max(0, p.currentStock - (p.reservedStock ?? 0))} pcs
                                    </SelectItem>
                                  )
                                })}
                              </SelectContent>
                            </Select>
                            {prod && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                SKU: <strong className="text-foreground">{prod.sku}</strong>
                                {" · "}
                                Available:{" "}
                                <strong className={cn(isStockDeficit ? "text-amber-500" : "text-emerald-500")}>
                                  {prod.currentStock - prod.reservedStock} pcs
                                </strong>
                              </div>
                            )}
                          </div>
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                            >
                              <Trash className="size-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Qty</label>
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => updateLine(idx, "qty", Math.max(1, line.qty - 1))}
                                className="px-2 py-1.5 border border-border rounded-l-xl bg-background hover:bg-muted font-bold text-xs"
                              >-</button>
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
                                className="px-2 py-1.5 border border-border rounded-r-xl bg-background hover:bg-muted font-bold text-xs"
                              >+</button>
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
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">GST %</label>
                            <Select
                              value={line.gstRate !== undefined ? String(line.gstRate) : ""}
                              onValueChange={(v) => updateLine(idx, "gstRate", v === "" ? undefined : parseFloat(v))}
                            >
                              <SelectTrigger id={`gst-select-${idx}`} className="w-full text-sm">
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_RATES.map((r) => (
                                  <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {isStockDeficit && (
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 bg-amber-500/15 px-3 py-2 rounded-xl text-xs font-semibold">
                            <Warning className="size-4 shrink-0" />
                            <span>Exceeds available stock — will trigger a manufacturing hold.</span>
                          </div>
                        )}

                        {lineTotal > 0 && (
                          <div className="flex items-center justify-between rounded-xl bg-background/80 border border-border/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                            <span>Sub: <strong className="text-foreground">{formatINR(lineTotal)}</strong></span>
                            <span>GST: <strong className="text-foreground">{line.gstRate !== undefined ? formatINR(lineTax) : "—"}</strong></span>
                            <span className="font-bold text-primary">Total: <strong className="text-foreground">{formatINR(lineTotal + (line.gstRate !== undefined ? lineTax : 0))}</strong></span>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <Button
                    variant="outline"
                    className="w-full py-5 rounded-xl border-dashed border-2 text-xs font-bold gap-2 text-muted-foreground hover:text-foreground"
                    onClick={() => addLine("")}
                  >
                    <Plus className="size-3.5" /> Add Custom Line
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Catalog Quick Adder */}
            <div className="lg:col-span-5 lg:sticky lg:top-6">
              <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                  <div className="space-y-2">
                    <CardTitle className="text-xs font-extrabold flex items-center gap-1.5 uppercase tracking-wider">
                      <Package className="size-3.5 text-primary" />
                      Catalog Quick-Add
                    </CardTitle>
                    <div className="relative">
                      <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search shirts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-8 text-xs rounded-lg"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  {filteredCatalog.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground">No matching shirts found</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {filteredCatalog.map((p) => {
                        const isOut = p.currentStock <= p.reservedStock
                        return (
                          <div
                            key={p.id}
                            onClick={() => addLine(p.id)}
                            className="group relative cursor-pointer rounded-lg border border-border/40 bg-card p-2 hover:border-primary/30 hover:shadow transition-all flex flex-col justify-between"
                          >
                            <div className="space-y-1">
                              <div className="h-16 w-full bg-muted/30 rounded overflow-hidden border border-border/30 flex items-center justify-center relative">
                                <TShirt className="size-5 text-muted-foreground/30" />
                                {p.imageUrl && (
                                  <img
                                    src={p.imageUrl}
                                    alt=""
                                    className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform"
                                    onError={(e) => { e.currentTarget.style.display = "none" }}
                                  />
                                )}
                                <span className={cn(
                                  "absolute bottom-0.5 right-0.5 px-1 rounded text-[8px] font-bold shadow-sm",
                                  isOut ? "bg-amber-500/90 text-white" : "bg-emerald-500/90 text-white"
                                )}>
                                  {isOut ? "Out" : `${p.currentStock}`}
                                </span>
                              </div>
                              <div>
                                <div className="text-[10px] font-bold text-foreground truncate group-hover:text-primary transition-colors leading-tight">{p.name}</div>
                                <div className="text-[8px] text-muted-foreground font-mono">SKU: {p.sku}</div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1 pt-1 border-t border-border/20">
                              <span className="text-[10px] font-extrabold text-foreground">{formatINR(p.price)}</span>
                              <span className="text-[8px] text-primary font-bold opacity-0 group-hover:opacity-100 transition-opacity">+ Add</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 2 && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 animate-in fade-in slide-in-from-right-4 duration-200">

            {/* Left: Summary + Notes */}
            <div className="lg:col-span-7 space-y-4">

              {/* Customer recap */}
              <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  {selectedCustomer && (
                    <img
                      src={getCompanyImageUrl(selectedCustomer.id)}
                      alt={selectedCustomer.name}
                      className="h-10 w-10 shrink-0 rounded-full border border-border/60 object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground">{selectedCustomer?.name}</div>
                    <div className="text-xs text-muted-foreground">{selectedCustomer?.contact || "No contact"} · Terms: {selectedCustomer?.paymentTerms}</div>
                  </div>
                  <button
                    onClick={() => setStep(0)}
                    className="text-xs text-primary hover:underline font-medium shrink-0"
                  >
                    Change
                  </button>
                </CardContent>
              </Card>

              {/* Line items recap */}
              <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/20 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ShoppingCart className="size-4 text-primary" />
                    {lines.filter((l) => l.productId).length} Line Item{lines.filter((l) => l.productId).length !== 1 ? "s" : ""}
                  </CardTitle>
                  <button onClick={() => setStep(1)} className="text-xs text-primary hover:underline font-medium">
                    Edit Items
                  </button>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-border/40">
                  {lines
                    .filter((l) => l.productId)
                    .map((l, idx) => {
                      const prod = allProducts.find((p) => p.id === l.productId)
                      const lineTotal = l.qty * l.unitPrice
                      const lineTax = (lineTotal * (l.gstRate ?? 0)) / 100
                      return (
                        <div key={idx} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-9 w-9 shrink-0 rounded-lg border bg-muted/30 flex items-center justify-center relative overflow-hidden">
                            <Package className="size-3.5 text-muted-foreground/30" />
                            {prod?.imageUrl && (
                              <img src={prod.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none" }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-foreground truncate">{prod?.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {l.qty} × {formatINR(l.unitPrice)} · GST {l.gstRate ?? "—"}%
                            </div>
                          </div>
                          <div className="text-xs font-bold text-foreground shrink-0">
                            {formatINR(lineTotal + lineTax)}
                          </div>
                        </div>
                      )
                    })}
                </CardContent>
              </Card>

              {/* Notes */}
              <Card className="border-border/60 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    Additional Notes <span className="text-muted-foreground font-normal">(optional)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special packaging, customizations, dispatch priority, or shipping instructions..."
                    rows={3}
                    className="w-full rounded-xl resize-none"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right: Invoice Summary + Actions */}
            <div className="lg:col-span-5 lg:sticky lg:top-6">
              <div className="bg-card border-border/60 shadow-lg rounded-2xl overflow-hidden border">
                <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
                <div className="p-5 space-y-5">
                  <h3 className="font-heading text-sm font-bold flex items-center gap-2 border-b pb-3">
                    <ShoppingCart className="size-4 text-primary" />
                    Invoice Summary
                  </h3>

                  <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                    {lines.filter((l) => l.productId).map((l, idx) => {
                      const prod = allProducts.find((p) => p.id === l.productId)
                      return (
                        <div key={idx} className="flex justify-between items-start text-xs gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-foreground truncate">{prod?.name}</div>
                            <div className="text-muted-foreground text-[10px]">Qty: {l.qty} × {formatINR(l.unitPrice)}</div>
                          </div>
                          <span className="font-bold text-foreground shrink-0">{formatINR(l.qty * l.unitPrice)}</span>
                        </div>
                      )
                    })}
                  </div>

                  <div className="border-t border-dashed border-border/60" />

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="font-semibold text-foreground">{formatINR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>GST / Taxes</span>
                      <span className="font-semibold text-foreground">{formatINR(taxTotal)}</span>
                    </div>
                    <div className="border-t border-border/50 pt-2 flex justify-between items-baseline">
                      <span className="font-bold text-foreground">Grand Total</span>
                      <span className="font-extrabold text-lg text-primary">{formatINR(grandTotal)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-border/30">
                    <Button
                      className="w-full h-11 rounded-xl font-bold gap-2"
                      disabled={saving}
                      onClick={() => handleCreate(true)}
                    >
                      {saving ? <Spinner className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                      Create Draft
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-xs text-muted-foreground font-semibold hover:text-destructive"
                      onClick={() => router.back()}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Navigation Footer */}
      <div className="flex items-center justify-between border-t border-border/40 pt-4">
        <Button
          variant="outline"
          onClick={step === 0 ? () => router.back() : goBack}
          className="gap-2 rounded-xl"
        >
          <ArrowLeft className="size-4" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-primary" : i < step ? "w-2 bg-primary/40" : "w-2 bg-border"
              )}
            />
          ))}
        </div>

        {step < 2 ? (
          <Button onClick={goNext} className="gap-2 rounded-xl">
            Next <ArrowRight className="size-4" />
          </Button>
        ) : (
          <div className="w-[90px]" />
        )}
      </div>

      {/* New Customer Dialog */}
      <Dialog open={showNewCustomer} onOpenChange={setShowNewCustomer}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Company Name *
              </label>
              <Input
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                placeholder="e.g. Zara India Pvt Ltd"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phone</label>
                <Input
                  value={newCustomerForm.contact}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, contact: e.target.value })}
                  placeholder="+91-99XXXXXXXX"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Email</label>
                <Input
                  type="email"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                  placeholder="orders@company.com"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Address</label>
              <Input
                value={newCustomerForm.address}
                onChange={(e) => setNewCustomerForm({ ...newCustomerForm, address: e.target.value })}
                placeholder="Street, City, PIN"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Credit Limit (₹)</label>
                <Input
                  type="number"
                  min={0}
                  value={newCustomerForm.creditLimit}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, creditLimit: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payment Terms</label>
                <Select
                  value={newCustomerForm.paymentTerms}
                  onValueChange={(v) => setNewCustomerForm({ ...newCustomerForm, paymentTerms: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Net 15", "Net 30", "Net 45", "Net 60", "Advance", "COD"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCustomer(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={savingCustomer || !newCustomerForm.name.trim()}>
              {savingCustomer ? <Spinner className="size-4 animate-spin mr-2" /> : null}
              Save Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
