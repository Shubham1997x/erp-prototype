"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useFetch, apiPost } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import type { Customer, Product, SalesOrderLine } from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Plus,
  Trash,
  ShoppingCart,
  Spinner,
  Package,
  Warning,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v)
}

const GST_RATES = [0, 5, 12, 18]

interface LineItem extends SalesOrderLine {
  gstRate: number
}

export default function NewOrderPage() {
  const router = useRouter()
  const { isSales, isAdmin } = useUser()

  const { data: allCustomers = [] } = useFetch<Customer[]>("/api/customers")
  const { data: allProducts = [] } = useFetch<Product[]>("/api/products")

  const [customerId, setCustomerId] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItem[]>([
    { productId: "", qty: 1, unitPrice: 0, gstRate: 18 },
  ])
  const [saving, setSaving] = useState(false)

  const canCreate = isSales || isAdmin

  const selectedCustomer = allCustomers.find((c) => c.id === customerId)

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
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

  function addLine() {
    setLines((l) => [...l, { productId: "", qty: 1, unitPrice: 0, gstRate: 18 }])
  }

  function removeLine(idx: number) {
    setLines((l) => l.filter((_, i) => i !== idx))
  }

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines]
  )
  const taxTotal = useMemo(
    () => lines.reduce((s, l) => s + (l.qty * l.unitPrice * l.gstRate) / 100, 0),
    [lines]
  )
  const grandTotal = subtotal + taxTotal

  const isValid = !!customerId && lines.length > 0 && lines.every((l) => l.productId && l.qty > 0)

  async function handleCreate(submitAsDraft = false) {
    if (!isValid) {
      toast.error("Please fill in all required fields")
      return
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
      toast.success(submitAsDraft ? "Order saved as draft" : "Order submitted")
      router.push(`/orders/${(order as { id: string }).id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create order")
    } finally {
      setSaving(false)
    }
  }

  if (!canCreate) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Warning size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Access Denied</p>
          <p className="mt-1 text-sm">Only Sales Executives can create orders.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 sm:px-8">
      <title>New Order | ShirtCo ERP</title>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="font-heading text-xl font-bold">New Sales Order</h1>
          <p className="text-sm text-muted-foreground">Fill in the details and submit or save as draft</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: main form */}
        <div className="space-y-5 lg:col-span-2">

          {/* Customer */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="font-heading text-sm font-semibold">Customer</h2>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Select Customer *
              </label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Choose a customer —</option>
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
                <p className="font-medium">{selectedCustomer.name}</p>
                {selectedCustomer.email && <p className="text-xs text-muted-foreground">{selectedCustomer.email}</p>}
                {selectedCustomer.contact && <p className="text-xs text-muted-foreground">{selectedCustomer.contact}</p>}
                <p className="text-xs text-muted-foreground">
                  Credit limit: {formatINR(selectedCustomer.creditLimit ?? 0)} · {selectedCustomer.paymentTerms}
                </p>
              </div>
            )}
          </div>

          {/* Order Lines */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold">Order Lines</h2>
              <span className="text-xs text-muted-foreground">{lines.length} item{lines.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => {
                const prod = allProducts.find((p) => p.id === line.productId)
                const lineTotal = line.qty * line.unitPrice
                const lineTax = (lineTotal * line.gstRate) / 100
                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3"
                  >
                    {/* Product select */}
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-muted/30 flex items-center justify-center">
                        {prod?.imageUrl ? (
                          <img src={prod.imageUrl} alt={prod.name} className="h-full w-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = "none" }} />
                        ) : (
                          <Package size={18} className="text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <select
                          value={line.productId}
                          onChange={(e) => updateLine(idx, "productId", e.target.value)}
                          className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                        >
                          <option value="">— Select Product —</option>
                          {allProducts.map((p) => {
                            const usedElsewhere = lines.some((l, i) => i !== idx && l.productId === p.id)
                            return (
                              <option key={p.id} value={p.id} disabled={usedElsewhere}>
                                {p.name} — {formatINR(p.price)} (Stock: {p.currentStock}){usedElsewhere ? " · already added" : ""}
                              </option>
                            )
                          })}
                        </select>
                        {prod && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            SKU: {prod.sku} · Available: {prod.currentStock - prod.reservedStock} pcs
                          </p>
                        )}
                      </div>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="mt-1 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash size={15} />
                        </button>
                      )}
                    </div>

                    {/* Qty / Price / GST */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) => updateLine(idx, "qty", Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Unit Price (₹)</label>
                        <input
                          type="number"
                          min={0}
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                          className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">GST %</label>
                        <select
                          value={line.gstRate}
                          onChange={(e) => updateLine(idx, "gstRate", parseFloat(e.target.value))}
                          className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Line total */}
                    {lineTotal > 0 && (
                      <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-1.5 text-xs">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">{formatINR(lineTotal)}</span>
                        <span className="text-muted-foreground">GST</span>
                        <span className="font-medium">{formatINR(lineTax)}</span>
                        <span className="text-muted-foreground">Line Total</span>
                        <span className="font-bold">{formatINR(lineTotal + lineTax)}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-dashed"
              onClick={addLine}
            >
              <Plus size={13} /> Add Product
            </Button>
          </div>

          {/* Notes */}
          <div className="glass-card p-5 space-y-3">
            <h2 className="font-heading text-sm font-semibold">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions, delivery notes, etc."
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>

        {/* Right: summary + actions */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-4 sticky top-6">
            <h2 className="font-heading text-sm font-semibold flex items-center gap-2">
              <ShoppingCart size={15} className="text-primary" /> Order Summary
            </h2>

            {lines.filter((l) => l.productId).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No products added yet</p>
            ) : (
              <div className="space-y-2">
                {lines
                  .filter((l) => l.productId)
                  .map((l, i) => {
                    const prod = allProducts.find((p) => p.id === l.productId)
                    return (
                      <div key={i} className="flex items-center justify-between text-xs gap-2">
                        <span className="truncate text-muted-foreground flex-1">{prod?.name ?? l.productId}</span>
                        <span className="shrink-0 font-medium">{formatINR(l.qty * l.unitPrice)}</span>
                      </div>
                    )
                  })}
              </div>
            )}

            <div className="border-t border-border/50 pt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>GST</span>
                <span>{formatINR(taxTotal)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1">
                <span>Total</span>
                <span>{formatINR(grandTotal)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Button
                className="w-full gap-2"
                disabled={!isValid || saving}
                onClick={() => handleCreate(false)}
              >
                {saving && <Spinner size={14} className="animate-spin" />}
                Submit Order
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={!isValid || saving}
                onClick={() => handleCreate(true)}
              >
                Save as Draft
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
