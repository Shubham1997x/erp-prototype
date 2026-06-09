"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Plus, X, Spinner } from "@phosphor-icons/react"
import { apiPost } from "@/hooks/use-api"
import { toast } from "sonner"
import type { Customer, Product, SalesOrder, SalesOrderLine } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

export function EditOrderDialog({
  order,
  allCustomers,
  allProducts,
  open,
  setOpen,
  onSuccess,
}: {
  order: SalesOrder
  allCustomers: Customer[]
  allProducts: Product[]
  open: boolean
  setOpen: (open: boolean) => void
  onSuccess: () => void
}) {
  const [editCustomerId, setEditCustomerId] = useState("")
  const [editLines, setEditLines] = useState<SalesOrderLine[]>([])
  const [editNotes, setEditNotes] = useState("")
  const [editChangeSummary, setEditChangeSummary] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const linesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && order) {
      setEditCustomerId(order.customerId)
      setEditLines(order.lines.map((l) => ({ ...l })))
      setEditNotes(order.notes || "")
      setEditChangeSummary("")
    }
  }, [open, order])

  function updateEditLine(idx: number, field: keyof SalesOrderLine, value: string | number | null) {
    setEditLines((prev) => {
      const next = [...prev]
      if (field === "productId") {
        const prod = allProducts.find((p) => p.id === value)
        next[idx] = { ...next[idx], productId: value as string, unitPrice: prod?.price ?? next[idx].unitPrice }
      } else {
        next[idx] = { ...next[idx], [field]: value }
      }
      return next
    })
  }

  async function handleAmendOrder() {
    if (!editChangeSummary.trim()) {
      toast.error("Describe what you changed")
      return
    }
    if (order.status === "DRAFT" && !editCustomerId) {
      toast.error("Select a customer")
      return
    }
    if (editLines.some((l) => !l.productId || l.qty <= 0)) {
      toast.error("Fill in all line items")
      return
    }
    if (editLines.some((l) => l.gstRate === null || l.gstRate === undefined)) {
      toast.error("Select a GST rate for all line items")
      return
    }
    setEditSaving(true)
    try {
      await apiPost(`/api/sales-orders/${order.id}/amend`, {
        changeSummary: editChangeSummary.trim(),
        lines: editLines,
        notes: editNotes,
        ...(order.status === "DRAFT" && editCustomerId ? { customerId: editCustomerId } : {}),
      })
      toast.success("Order updated")
      setOpen(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update order")
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" /> Edit Order
          </DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-4 py-2">
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
            Editable while status is <span className="font-semibold text-foreground">{order.status}</span>.
            {order.status !== "DRAFT" && " Customer cannot be changed after draft."}
          </p>
          {order.status === "DRAFT" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer *</label>
              <select
                value={editCustomerId}
                onChange={(e) => setEditCustomerId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Select Customer —</option>
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
              Order Lines *
            </label>
            {/* Headers for desktop */}
            <div className="hidden sm:flex gap-3 px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="w-[35%]">Product</div>
              <div className="w-[65%] flex gap-2">
                <div className="w-1/4 text-center">Qty</div>
                <div className="w-1/4">Price</div>
                <div className="w-1/4">GST</div>
                <div className="w-1/4 text-right pr-8">Line Total</div>
              </div>
            </div>
            <div className="min-w-0 space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {editLines.map((line, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-3 items-center rounded-lg border border-border/60 p-3 bg-muted/5 shadow-sm transition-colors hover:bg-muted/10">
                  <div className="w-full sm:w-[35%]">
                    <select
                      value={line.productId}
                      onChange={(e) => updateEditLine(idx, "productId", e.target.value)}
                      className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">— Select Product —</option>
                      {allProducts.map((p) => {
                        const selectedElsewhere = editLines.some((l, i) => i !== idx && l.productId === p.id)
                        return (
                          <option key={p.id} value={p.id} disabled={selectedElsewhere}>
                            {p.name} (Stock: {p.currentStock}){selectedElsewhere ? " — already added" : ""}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                  <div className="flex w-full sm:w-[65%] gap-2 items-center">
                    <div className="w-1/4">
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateEditLine(idx, "qty", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Qty"
                      />
                    </div>
                    <div className="w-1/4">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.unitPrice}
                        onChange={(e) => updateEditLine(idx, "unitPrice", e.target.value === "" ? "" : parseFloat(e.target.value))}
                        className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        title="Unit price"
                        placeholder="Price"
                      />
                    </div>
                    <div className="w-1/4">
                      <select
                        value={line.gstRate === null || line.gstRate === undefined ? "" : String(line.gstRate)}
                        onChange={(e) => {
                          const v = e.target.value === "" ? null : parseFloat(e.target.value)
                          updateEditLine(idx, "gstRate", v)
                        }}
                        className={cn(
                          "w-full rounded-md border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30",
                          (line.gstRate === null || line.gstRate === undefined) ? "border-amber-400 bg-amber-500/5 text-amber-700 dark:text-amber-400" : "border-input bg-background"
                        )}
                        title="GST Rate"
                      >
                        <option value="" disabled>GST</option>
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </div>
                    <div className="w-1/4 flex items-center justify-end gap-2 pr-1">
                      <span className="text-sm font-bold text-foreground whitespace-nowrap">
                        {line.unitPrice > 0 ? formatINR(line.qty * line.unitPrice * (1 + ((line.gstRate as number) ?? 0) / 100)) : "—"}
                      </span>
                      {editLines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setEditLines((l) => l.filter((_, i) => i !== idx))}
                          className="shrink-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive p-1.5 rounded-md"
                        >
                          <X size={16} />
                        </button>
                      ) : (
                        <div className="w-7"></div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={linesEndRef} />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full border-dashed py-5 hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
              onClick={() => {
                setEditLines((l) => [...l, { productId: "", qty: 1, unitPrice: 0, gstRate: null } as any])
                setTimeout(() => linesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
              }}
            >
              <Plus size={16} /> Add Another Line Item
            </Button>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="Internal notes…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What changed? *</label>
            <input
              value={editChangeSummary}
              onChange={(e) => setEditChangeSummary(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="e.g. Increased qty on line 2, updated notes"
            />
          </div>
          {editLines.some((l) => l.unitPrice > 0) && (
            <div className="rounded-lg bg-muted/30 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Order Total</span>
              <span className="font-bold text-sm">
                {formatINR(editLines.reduce((s, l) => s + l.qty * l.unitPrice * (1 + ((l.gstRate as number) ?? 0) / 100), 0))}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAmendOrder}
            disabled={editSaving}
          >
            {editSaving && <Spinner size={14} className="animate-spin mr-1" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
