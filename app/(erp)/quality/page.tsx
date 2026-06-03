"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/use-api"
import type { QualityInspection, QualityInspectionStatus, ScrapOrder, ReworkOrder, ReworkStatus } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus, Spinner, CheckCircle, XCircle, Warning, ClipboardText,
  Trash, ArrowsClockwise, ChartBar,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

function getHeaders() {
  const user = JSON.parse(localStorage.getItem("current_user") || '{"id":"usr-1","role":"Admin"}')
  return { "Content-Type": "application/json", "X-User-Id": user.id, "X-User-Role": user.role }
}

function formatDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

const INSPECTION_STATUS: Record<QualityInspectionStatus, { label: string; color: string }> = {
  PENDING:          { label: "Pending",         color: "bg-muted text-muted-foreground" },
  PASSED:           { label: "Passed",          color: "bg-green-500/15 text-green-500" },
  PARTIALLY_PASSED: { label: "Partial",         color: "bg-amber-500/15 text-amber-500" },
  FAILED:           { label: "Failed",          color: "bg-red-500/15 text-red-500" },
}

const REWORK_STATUS: Record<ReworkStatus, { label: string; color: string }> = {
  PENDING:     { label: "Pending",     color: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "In Progress", color: "bg-blue-500/15 text-blue-500" },
  COMPLETED:   { label: "Completed",   color: "bg-green-500/15 text-green-500" },
  SCRAPPED:    { label: "Scrapped",    color: "bg-red-500/15 text-red-500" },
}

const REWORK_NEXT: Partial<Record<ReworkStatus, ReworkStatus>> = {
  PENDING: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
}

function StatCard({ title, value, sub, icon, color }: {
  title: string; value: string | number; sub?: string; icon: React.ReactNode; color: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function QualityPage() {
  const { data: user } = useUser()
  const { data: inspResp, loading: loadingInsp, refetch: refetchInsp } =
    useFetch<{ data: QualityInspection[]; total: number }>("/api/quality-inspections?limit=200")
  const { data: scrapResp, loading: loadingScrap, refetch: refetchScrap } =
    useFetch<{ data: ScrapOrder[]; total: number }>("/api/scrap-orders?limit=200")
  const { data: reworkResp, loading: loadingRework, refetch: refetchRework } =
    useFetch<{ data: ReworkOrder[]; total: number }>("/api/rework-orders?limit=200")

  const inspections = inspResp?.data ?? []
  const scraps = scrapResp?.data ?? []
  const reworks = reworkResp?.data ?? []

  // Inspection dialog
  const [newInspOpen, setNewInspOpen] = useState(false)
  const [inspForm, setInspForm] = useState({
    productionOrderId: "",
    producedQty: "",
    passedQty: "",
    rejectedQty: "",
    defectCodes: "",
    notes: "",
    inspectorId: "",
  })

  // Scrap dialog
  const [newScrapOpen, setNewScrapOpen] = useState(false)
  const [scrapForm, setScrapForm] = useState({
    productionOrderId: "",
    productId: "",
    qtyScrapped: "",
    scrapReason: "",
    materialCostWrittenOff: "",
  })

  // Rework dialog
  const [newReworkOpen, setNewReworkOpen] = useState(false)
  const [reworkForm, setReworkForm] = useState({
    productId: "",
    qty: "",
    reworkReason: "",
    plannedStart: "",
    plannedEnd: "",
  })

  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState<string | null>(null)

  // Computed stats
  const totalInspections = inspections.length
  const passed = inspections.filter(i => i.status === "PASSED" || i.status === "PARTIALLY_PASSED")
  const passRate = totalInspections > 0 ? Math.round((passed.length / totalInspections) * 100) : 0
  const thisMonth = new Date()
  thisMonth.setDate(1)
  const rejectedThisMonth = inspections
    .filter(i => new Date(i.createdAt) >= thisMonth && i.status === "FAILED")
    .length

  async function handleCreateInspection() {
    if (!inspForm.productionOrderId) { toast.error("Production Order ID is required"); return }
    const produced = Number(inspForm.producedQty)
    const passed2 = Number(inspForm.passedQty)
    const rejected = Number(inspForm.rejectedQty)
    if (!produced || produced <= 0) { toast.error("Produced quantity must be > 0"); return }
    if (passed2 < 0 || rejected < 0) { toast.error("Quantities cannot be negative"); return }
    setSaving(true)
    try {
      const u = JSON.parse(localStorage.getItem("current_user") || '{"id":"usr-1"}')
      const res = await fetch("/api/quality-inspections", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productionOrderId: inspForm.productionOrderId,
          producedQty: produced,
          passedQty: passed2,
          rejectedQty: rejected,
          defectCodes: inspForm.defectCodes || undefined,
          notes: inspForm.notes || undefined,
          inspectorId: inspForm.inspectorId || u.id,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success("Inspection created")
      setNewInspOpen(false)
      setInspForm({ productionOrderId: "", producedQty: "", passedQty: "", rejectedQty: "", defectCodes: "", notes: "", inspectorId: "" })
      refetchInsp()
    } catch (e) {
      toast.error((e as Error).message || "Failed to create inspection")
    } finally { setSaving(false) }
  }

  async function handleCreateScrap() {
    const qty = Number(scrapForm.qtyScrapped)
    if (!qty || qty <= 0) { toast.error("Quantity must be > 0"); return }
    if (!scrapForm.scrapReason) { toast.error("Scrap reason is required"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/scrap-orders", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productionOrderId: scrapForm.productionOrderId || undefined,
          productId: scrapForm.productId || undefined,
          qtyScrapped: qty,
          scrapReason: scrapForm.scrapReason,
          materialCostWrittenOff: Number(scrapForm.materialCostWrittenOff) || 0,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success("Scrap order created")
      setNewScrapOpen(false)
      setScrapForm({ productionOrderId: "", productId: "", qtyScrapped: "", scrapReason: "", materialCostWrittenOff: "" })
      refetchScrap()
    } catch (e) {
      toast.error((e as Error).message || "Failed to create scrap order")
    } finally { setSaving(false) }
  }

  async function handleCreateRework() {
    if (!reworkForm.productId) { toast.error("Product ID is required"); return }
    const qty = Number(reworkForm.qty)
    if (!qty || qty <= 0) { toast.error("Quantity must be > 0"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/rework-orders", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          productId: reworkForm.productId,
          qty,
          reworkReason: reworkForm.reworkReason || undefined,
          plannedStart: reworkForm.plannedStart || undefined,
          plannedEnd: reworkForm.plannedEnd || undefined,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success("Rework order created")
      setNewReworkOpen(false)
      setReworkForm({ productId: "", qty: "", reworkReason: "", plannedStart: "", plannedEnd: "" })
      refetchRework()
    } catch (e) {
      toast.error((e as Error).message || "Failed to create rework order")
    } finally { setSaving(false) }
  }

  async function advanceRework(rework: ReworkOrder) {
    const next = REWORK_NEXT[rework.status]
    if (!next) return
    setAdvancing(rework.id)
    try {
      const res = await fetch(`/api/rework-orders/${rework.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success(`Rework order moved to ${next.replace("_", " ")}`)
      refetchRework()
    } catch (e) {
      toast.error((e as Error).message || "Failed to update rework order")
    } finally { setAdvancing(null) }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CheckCircle size={24} weight="duotone" className="text-primary" />
          Quality Control
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Inspections, scrap management, and rework tracking</p>
      </div>

      <Tabs defaultValue="inspections">
        <TabsList className="mb-4">
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="scrap">Scrap Orders</TabsTrigger>
          <TabsTrigger value="rework">Rework Orders</TabsTrigger>
        </TabsList>

        {/* ──────────── INSPECTIONS TAB ──────────── */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              title="Total Inspections"
              value={totalInspections}
              icon={<ClipboardText size={20} />}
              color="bg-blue-500/10 text-blue-500"
            />
            <StatCard
              title="Pass Rate"
              value={`${passRate}%`}
              sub={`${passed.length} of ${totalInspections} passed`}
              icon={<CheckCircle size={20} />}
              color="bg-green-500/10 text-green-500"
            />
            <StatCard
              title="Failed This Month"
              value={rejectedThisMonth}
              icon={<XCircle size={20} />}
              color="bg-red-500/10 text-red-500"
            />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{inspections.length} records</p>
            <Button size="sm" onClick={() => setNewInspOpen(true)}>
              <Plus size={16} className="mr-1" /> New Inspection
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inspection ID</TableHead>
                  <TableHead>Production Order</TableHead>
                  <TableHead>Inspector</TableHead>
                  <TableHead className="text-right">Produced</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead>Defects</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInsp ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">
                    <Spinner size={20} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : inspections.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No inspections recorded yet
                  </TableCell></TableRow>
                ) : inspections.map(insp => {
                  const meta = INSPECTION_STATUS[insp.status]
                  return (
                    <TableRow key={insp.id}>
                      <TableCell className="font-mono text-xs">{insp.id}</TableCell>
                      <TableCell className="font-mono text-xs">{insp.productionOrderId}</TableCell>
                      <TableCell className="text-sm">{insp.inspectorId ?? "—"}</TableCell>
                      <TableCell className="text-right">{insp.producedQty}</TableCell>
                      <TableCell className="text-right text-green-600 font-medium">{insp.passedQty}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">{insp.rejectedQty}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                        {insp.defectCodes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(insp.createdAt)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ──────────── SCRAP ORDERS TAB ──────────── */}
        <TabsContent value="scrap" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{scraps.length} scrap orders</p>
            <Button size="sm" variant="destructive" onClick={() => setNewScrapOpen(true)}>
              <Plus size={16} className="mr-1" /> New Scrap
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scrap ID</TableHead>
                  <TableHead>Production Order</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty Scrapped</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Cost Written Off</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingScrap ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">
                    <Spinner size={20} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : scraps.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No scrap orders yet
                  </TableCell></TableRow>
                ) : scraps.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.id}</TableCell>
                    <TableCell className="font-mono text-xs">{s.productionOrderId ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.productId ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium text-red-600">{s.qtyScrapped}</TableCell>
                    <TableCell className="text-sm max-w-[160px] truncate">{s.scrapReason}</TableCell>
                    <TableCell className="text-right font-medium">{formatINR(s.materialCostWrittenOff)}</TableCell>
                    <TableCell className="text-sm">{s.createdBy}</TableCell>
                    <TableCell className="text-sm">{formatDate(s.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ──────────── REWORK ORDERS TAB ──────────── */}
        <TabsContent value="rework" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{reworks.length} rework orders</p>
            <Button size="sm" onClick={() => setNewReworkOpen(true)}>
              <Plus size={16} className="mr-1" /> New Rework
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rework ID</TableHead>
                  <TableHead>Original PO</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Planned Start</TableHead>
                  <TableHead>Planned End</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingRework ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8">
                    <Spinner size={20} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : reworks.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No rework orders yet
                  </TableCell></TableRow>
                ) : reworks.map(rw => {
                  const meta = REWORK_STATUS[rw.status]
                  const next = REWORK_NEXT[rw.status]
                  return (
                    <TableRow key={rw.id}>
                      <TableCell className="font-mono text-xs">{rw.id}</TableCell>
                      <TableCell className="font-mono text-xs">{rw.originalProductionOrderId ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{rw.productId}</TableCell>
                      <TableCell className="text-right">{rw.qty}</TableCell>
                      <TableCell className="text-sm max-w-[140px] truncate">{rw.reworkReason ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(rw.plannedStart)}</TableCell>
                      <TableCell className="text-sm">{formatDate(rw.plannedEnd)}</TableCell>
                      <TableCell>
                        {next && (
                          <Button size="sm" variant="outline" disabled={advancing === rw.id} onClick={() => advanceRework(rw)}>
                            {advancing === rw.id
                              ? <Spinner size={14} className="animate-spin mr-1" />
                              : <ArrowsClockwise size={14} className="mr-1" />}
                            {next === "IN_PROGRESS" ? "Start" : "Complete"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ──────────── NEW INSPECTION DIALOG ──────────── */}
      <Dialog open={newInspOpen} onOpenChange={setNewInspOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Quality Inspection</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Production Order ID *</Label>
              <Input placeholder="prod-001" value={inspForm.productionOrderId}
                onChange={e => setInspForm(f => ({ ...f, productionOrderId: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Enter the production order ID (must be in QUALITY_CHECK status)</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Produced Qty *</Label>
                <Input type="number" min={1} placeholder="0" value={inspForm.producedQty}
                  onChange={e => setInspForm(f => ({ ...f, producedQty: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Passed Qty</Label>
                <Input type="number" min={0} placeholder="0" value={inspForm.passedQty}
                  onChange={e => setInspForm(f => ({ ...f, passedQty: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rejected Qty</Label>
                <Input type="number" min={0} placeholder="0" value={inspForm.rejectedQty}
                  onChange={e => setInspForm(f => ({ ...f, rejectedQty: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Defect Codes (comma-separated)</Label>
              <Input placeholder="DC001, DC002, SCRATCH" value={inspForm.defectCodes}
                onChange={e => setInspForm(f => ({ ...f, defectCodes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Inspector ID (optional)</Label>
              <Input placeholder="Leave blank to use current user" value={inspForm.inspectorId}
                onChange={e => setInspForm(f => ({ ...f, inspectorId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={inspForm.notes}
                onChange={e => setInspForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewInspOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInspection} disabled={saving}>
              {saving && <Spinner size={16} className="animate-spin mr-2" />}
              Create Inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────── NEW SCRAP DIALOG ──────────── */}
      <Dialog open={newScrapOpen} onOpenChange={setNewScrapOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Scrap Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Production Order (optional)</Label>
              <Input placeholder="prod-001" value={scrapForm.productionOrderId}
                onChange={e => setScrapForm(f => ({ ...f, productionOrderId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Product ID (optional)</Label>
              <Input placeholder="prod-001" value={scrapForm.productId}
                onChange={e => setScrapForm(f => ({ ...f, productId: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Scrapped *</Label>
                <Input type="number" min={1} placeholder="0" value={scrapForm.qtyScrapped}
                  onChange={e => setScrapForm(f => ({ ...f, qtyScrapped: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cost Written Off</Label>
                <Input type="number" min={0} placeholder="0" value={scrapForm.materialCostWrittenOff}
                  onChange={e => setScrapForm(f => ({ ...f, materialCostWrittenOff: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Scrap Reason *</Label>
              <Textarea rows={2} placeholder="Describe why items were scrapped" value={scrapForm.scrapReason}
                onChange={e => setScrapForm(f => ({ ...f, scrapReason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewScrapOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleCreateScrap} disabled={saving}>
              {saving && <Spinner size={16} className="animate-spin mr-2" />}
              <Trash size={16} className="mr-1" /> Create Scrap Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────── NEW REWORK DIALOG ──────────── */}
      <Dialog open={newReworkOpen} onOpenChange={setNewReworkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Rework Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Product ID *</Label>
              <Input placeholder="prod-001" value={reworkForm.productId}
                onChange={e => setReworkForm(f => ({ ...f, productId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" min={1} placeholder="0" value={reworkForm.qty}
                onChange={e => setReworkForm(f => ({ ...f, qty: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rework Reason</Label>
              <Textarea rows={2} placeholder="Describe the issue requiring rework" value={reworkForm.reworkReason}
                onChange={e => setReworkForm(f => ({ ...f, reworkReason: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Planned Start</Label>
                <Input type="date" value={reworkForm.plannedStart}
                  onChange={e => setReworkForm(f => ({ ...f, plannedStart: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Planned End</Label>
                <Input type="date" value={reworkForm.plannedEnd}
                  onChange={e => setReworkForm(f => ({ ...f, plannedEnd: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewReworkOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateRework} disabled={saving}>
              {saving && <Spinner size={16} className="animate-spin mr-2" />}
              Create Rework Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
