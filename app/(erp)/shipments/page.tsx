"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch } from "@/hooks/use-api"
import type { ShipmentStatus, Shipment, SalesOrder, Customer } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Truck, Plus, Spinner, Lock } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

const STATUS_META: Record<ShipmentStatus, { label: string; color: string }> = {
  READY_TO_SHIP: { label: "Ready to Ship", color: "bg-cyan-500/10 text-cyan-600" },
  PACKING:       { label: "Packing",        color: "bg-yellow-500/10 text-yellow-600" },
  DISPATCHED:    { label: "Dispatched",     color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  IN_TRANSIT:    { label: "In Transit",     color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  DELIVERED:     { label: "Delivered",      color: "bg-green-500/10 text-green-600" },
  RETURNED:      { label: "Returned",       color: "bg-orange-500/10 text-orange-500" },
  DAMAGED:       { label: "Damaged",        color: "bg-rose-500/10 text-rose-500" },
  CANCELLED:     { label: "Cancelled",      color: "bg-destructive/10 text-destructive" },
}

const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  READY_TO_SHIP: "PACKING",
  PACKING: "DISPATCHED",
  DISPATCHED: "IN_TRANSIT",
  IN_TRANSIT: "DELIVERED",
}

const TRANSITION_ACTION_LABELS: Record<ShipmentStatus, string> = {
  READY_TO_SHIP: "Start Packing",
  PACKING: "Dispatch Shipment",
  DISPATCHED: "Mark In Transit",
  IN_TRANSIT: "Deliver Shipment",
  DELIVERED: "Deliver",
  RETURNED: "Return",
  DAMAGED: "Mark Damaged",
  CANCELLED: "Cancel",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const CARRIERS = ["DHL", "FedEx", "BlueDart", "DTDC", "Delhivery"]

export default function ShipmentsPage() {
  const { isSales, isInventory, loading: loadingUser } = useUser()
  const canManageShipments = isSales || isInventory
  const { data: shipments, loading: loadingShp, refetch: refetchShp } = useFetch<Shipment[]>("/api/shipments")
  const { data: salesOrders } = useFetch<SalesOrder[]>("/api/sales-orders")
  const { data: customers } = useFetch<Customer[]>("/api/customers")

  const [open, setOpen] = useState(false)
  const [soId, setSoId] = useState("")
  const [carrier, setCarrier] = useState("")
  const [tracking, setTracking] = useState("")
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const allShipments = shipments ?? []
  const allSalesOrders = salesOrders ?? []
  const allCustomers = customers ?? []

  // Sales orders ready to ship that don't already have a shipment record
  const shippableOrders = allSalesOrders.filter(
    (so) => so.status === "READY_TO_SHIP" && !allShipments.some((s) => s.salesOrderId === so.id)
  )

  const inTransitCount = allShipments.filter((s) => ["PACKING", "DISPATCHED", "IN_TRANSIT"].includes(s.status)).length

  async function handleCreate() {
    if (!soId) return
    setSaving(true)
    try {
      await apiPost("/api/shipments", {
        salesOrderId: soId,
        carrier: carrier || null,
        trackingNumber: tracking || null
      })
      toast.success("Shipment dispatched and scheduled")
      setOpen(false)
      setSoId("")
      setCarrier("")
      setTracking("")
      refetchShp()
    } catch {
      toast.error("Failed to create shipment")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusTransition(shpId: string, nextStatus: ShipmentStatus) {
    setUpdatingId(shpId)
    try {
      await apiPatch(`/api/shipments/${shpId}/status`, { status: nextStatus })
      toast.success(`Shipment updated to ${STATUS_META[nextStatus].label}`)
      refetchShp()
    } catch {
      toast.error("Failed to update shipment status")
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>Shipments | ShirtCo ERP</title>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
            <Truck size={22} weight="fill" className="text-primary" /> Shipments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loadingShp ? "Loading..." : `${allShipments.length} total · ${inTransitCount} in transit`}
          </p>
        </div>
        <Button 
          onClick={() => setOpen(true)} 
          className="gap-2" 
          disabled={shippableOrders.length === 0 || loadingUser || !canManageShipments}
        >
          {(!loadingUser && !canManageShipments) ? <Lock size={16} weight="bold" /> : <Plus size={16} weight="bold" />} New Shipment
        </Button>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_META).map(([s, meta]) => {
          const count = allShipments.filter((sh) => sh.status === s).length
          if (count === 0) return null
          return (
            <span key={s} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>
              {meta.label}: {count}
            </span>
          )
        })}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loadingShp ? (
          <div className="p-12 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Spinner className="animate-spin" size={16} /> Loading shipments...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold text-xs">Shipment ID</TableHead>
                <TableHead className="font-semibold text-xs">Sales Order</TableHead>
                <TableHead className="font-semibold text-xs">Customer</TableHead>
                <TableHead className="font-semibold text-xs">Carrier</TableHead>
                <TableHead className="font-semibold text-xs">Tracking #</TableHead>
                <TableHead className="font-semibold text-xs">Status</TableHead>
                <TableHead className="font-semibold text-xs">Updated</TableHead>
                <TableHead className="font-semibold text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allShipments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Truck size={32} className="mx-auto mb-2 opacity-30" />
                    No shipments yet
                  </TableCell>
                </TableRow>
              )}
              {allShipments.map((shp) => {
                const so = allSalesOrders.find((s) => s.id === shp.salesOrderId)
                const customer = allCustomers.find((c) => c.id === so?.customerId)
                const meta = STATUS_META[shp.status]
                const next = NEXT_STATUS[shp.status]
                const isUpdating = updatingId === shp.id
                return (
                  <TableRow key={shp.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-primary">{shp.id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{shp.salesOrderId}</TableCell>
                    <TableCell className="font-medium text-[13px]">{customer?.name ?? "—"}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{shp.carrier ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{shp.trackingNumber ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(shp.updatedAt)}</TableCell>
                    <TableCell>
                      {next && (
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={isUpdating || loadingUser || !canManageShipments}
                          onClick={() => handleStatusTransition(shp.id, next)}
                        >
                          {isUpdating && <Spinner className="animate-spin mr-1" size={10} />}
                          {(!loadingUser && !canManageShipments) ? <Lock size={10} className="mr-1" /> : null}
                          {TRANSITION_ACTION_LABELS[shp.status]}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">New Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Order (Ready to Ship)</label>
              <select value={soId} onChange={(e) => setSoId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold">
                <option value="">-- Select Order --</option>
                {shippableOrders.map((so) => {
                  const cust = allCustomers.find((c) => c.id === so.customerId)
                  return (
                    <option key={so.id} value={so.id}>{so.id} — {cust?.name ?? "Unknown Customer"}</option>
                  )
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrier</label>
              <select value={carrier} onChange={(e) => setCarrier(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                <option value="">-- Select Carrier --</option>
                {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking Number (optional)</label>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="e.g. DHL202606030001"
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!soId || saving}>
              {saving && <Spinner size={12} className="animate-spin mr-1" />}
              Create Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
