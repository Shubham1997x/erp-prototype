"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShoppingCart, Plus, X, Spinner } from "@phosphor-icons/react"
import { apiPost } from "@/hooks/use-api"
import { toast } from "sonner"
import type { Customer, Product, SalesOrder, SalesOrderLine } from "@/lib/types"

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

  useEffect(() => {
    if (open && order) {
      setEditCustomerId(order.customer_id)
      setEditLines(order.lines.map((l) => ({ ...l })))
      setEditNotes(order.notes || "")
      setEditChangeSummary("")
    }
  }, [open, order])

  function updateEditLine(idx: number, field: keyof SalesOrderLine, value: string | number) {
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
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
            <div className="min-w-0 space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {editLines.map((line, idx) => (
                <div key={idx} className="min-w-0 space-y-2 rounded-lg border border-border/60 p-2">
                  <select
                    value={line.productId}
                    onChange={(e) => updateEditLine(idx, "productId", e.target.value)}
                    className="w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs"
                  >
                    <option value="">— Product —</option>
                    {allProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {p.currentStock})
                      </option>
                    ))}
                  </select>
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={(e) => updateEditLine(idx, "qty", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                      className="w-16 shrink-0 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-center font-bold"
                      placeholder="Qty"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitPrice}
                      onChange={(e) => updateEditLine(idx, "unitPrice", e.target.value === "" ? "" : parseFloat(e.target.value))}
                      className="w-24 shrink-0 rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                      title="Unit price"
                    />
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-muted-foreground">
                      {line.unitPrice > 0 ? formatINR(line.qty * line.unitPrice) : "—"}
                    </span>
                    {editLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEditLines((l) => l.filter((_, i) => i !== idx))}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 w-full border-dashed"
              onClick={() => setEditLines((l) => [...l, { productId: "", qty: 1, unitPrice: 0 }])}
            >
              <Plus size={12} /> Add Line
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
                {formatINR(editLines.reduce((s, l) => s + l.qty * l.unitPrice, 0))}
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
