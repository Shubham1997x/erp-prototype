"use client"

import { useState, useCallback } from "react"
import { useFetch, apiPost } from "@/hooks/use-api"
import type { Invoice, InvoiceStatus, SupplierInvoice, Customer, Supplier } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus, Minus, Spinner, Receipt, Buildings, CurrencyInr, Warning,
  CheckCircle, Clock, ArrowDown, ArrowUp, Users,
} from "@phosphor-icons/react"
import { toast } from "sonner"

function getHeaders() {
  const user = JSON.parse(localStorage.getItem("current_user") || '{"id":"usr-1","role":"Admin"}')
  return { "Content-Type": "application/json", "X-User-Id": user.id, "X-User-Role": user.role }
}

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso?: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return `${days}d ago`
}

const INV_STATUS: Record<InvoiceStatus, { label: string; color: string }> = {
  DRAFT:            { label: "Draft",            color: "bg-muted text-muted-foreground" },
  ISSUED:           { label: "Issued",           color: "bg-blue-500/15 text-blue-500" },
  PARTIALLY_PAID:   { label: "Partial",          color: "bg-amber-500/15 text-amber-500" },
  PAID:             { label: "Paid",             color: "bg-green-500/15 text-green-500" },
  OVERDUE:          { label: "Overdue",          color: "bg-red-500/15 text-red-500" },
  DISPUTED:         { label: "Disputed",         color: "bg-orange-500/15 text-orange-500" },
  VOID:             { label: "Void",             color: "bg-muted text-muted-foreground" },
}

const SI_STATUS: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: "Received", color: "bg-blue-500/15 text-blue-500" },
  APPROVED: { label: "Approved", color: "bg-emerald-500/15 text-emerald-500" },
  PAID:     { label: "Paid",     color: "bg-green-500/15 text-green-500" },
  DISPUTED: { label: "Disputed", color: "bg-orange-500/15 text-orange-500" },
}

interface FinanceReport {
  totalInvoiced: number
  totalCollected: number
  outstandingAR: number
  overdueAR: number
  totalAPOutstanding: number
  overdueAP: number
  topUnpaidCustomers: { id: string; name: string; outstanding: number }[]
}

interface InvoiceLine {
  description: string
  qty: number
  unitPrice: number
  taxRate: number
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, icon, color }: {
  title: string; value: string; sub?: string; icon: React.ReactNode; color: string
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function FinancePage() {
  const { data: invoicesResp, loading: loadingInv, refetch: refetchInv } =
    useFetch<{ data: Invoice[]; total: number }>("/api/invoices?limit=200")
  const { data: siResp, loading: loadingSI, refetch: refetchSI } =
    useFetch<{ data: SupplierInvoice[]; total: number }>("/api/supplier-invoices?limit=200")
  const { data: finReport, refetch: refetchReport } =
    useFetch<FinanceReport>("/api/reports/finance")
  const { data: customersResp } =
    useFetch<{ data: Customer[] } | Customer[]>("/api/customers?limit=200")
  const { data: suppliersResp } =
    useFetch<{ data: Supplier[] } | Supplier[]>("/api/suppliers?limit=200")

  const invoices = invoicesResp?.data ?? []
  const supplierInvoices = siResp?.data ?? []
  const customers = Array.isArray(customersResp)
    ? customersResp
    : (customersResp as { data: Customer[] } | null)?.data ?? []
  const suppliers = Array.isArray(suppliersResp)
    ? suppliersResp
    : (suppliersResp as { data: Supplier[] } | null)?.data ?? []

  // New Invoice dialog
  const [newInvOpen, setNewInvOpen] = useState(false)
  const [invForm, setInvForm] = useState({
    customerId: "",
    salesOrderId: "",
    notes: "",
    dueDate: "",
  })
  const [invLines, setInvLines] = useState<InvoiceLine[]>([
    { description: "", qty: 1, unitPrice: 0, taxRate: 18 },
  ])

  // Record Payment dialog (customer invoice)
  const [payDialog, setPayDialog] = useState<Invoice | null>(null)
  const [payForm, setPayForm] = useState({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "" })

  // New Supplier Invoice dialog
  const [newSIOpen, setNewSIOpen] = useState(false)
  const [siForm, setSIForm] = useState({
    supplierId: "",
    purchaseOrderId: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    total: "",
  })

  // Supplier Invoice Payment dialog
  const [siPayDialog, setSIPayDialog] = useState<SupplierInvoice | null>(null)
  const [siPayForm, setSIPayForm] = useState({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "" })

  const [saving, setSaving] = useState(false)

  const refetchAll = useCallback(() => { refetchInv(); refetchSI(); refetchReport() }, [refetchInv, refetchSI, refetchReport])

  // ── Create Invoice ────────────────────────────────────────────────────────
  async function handleCreateInvoice() {
    if (!invForm.customerId) { toast.error("Customer is required"); return }
    if (invLines.some(l => !l.description || l.qty <= 0 || l.unitPrice < 0)) {
      toast.error("Fill all line items correctly"); return
    }
    setSaving(true)
    try {
      await fetch("/api/invoices", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          customerId: invForm.customerId,
          salesOrderId: invForm.salesOrderId || undefined,
          notes: invForm.notes || undefined,
          dueDate: invForm.dueDate || undefined,
          lines: invLines,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      toast.success("Invoice created")
      setNewInvOpen(false)
      setInvForm({ customerId: "", salesOrderId: "", notes: "", dueDate: "" })
      setInvLines([{ description: "", qty: 1, unitPrice: 0, taxRate: 18 }])
      refetchAll()
    } catch {
      toast.error("Failed to create invoice")
    } finally { setSaving(false) }
  }

  // ── Record Payment ────────────────────────────────────────────────────────
  async function handlePayment() {
    if (!payDialog) return
    if (!payForm.amount || !payForm.paymentDate) { toast.error("Amount and date are required"); return }
    setSaving(true)
    try {
      await fetch(`/api/invoices/${payDialog.id}/payment`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          amount: parseFloat(payForm.amount),
          paymentDate: payForm.paymentDate,
          method: payForm.method,
          reference: payForm.reference || undefined,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      toast.success("Payment recorded")
      setPayDialog(null)
      setPayForm({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "" })
      refetchAll()
    } catch {
      toast.error("Failed to record payment")
    } finally { setSaving(false) }
  }

  // ── Create Supplier Invoice ───────────────────────────────────────────────
  async function handleCreateSI() {
    if (!siForm.supplierId) { toast.error("Supplier is required"); return }
    if (!siForm.total || parseFloat(siForm.total) <= 0) { toast.error("Total must be > 0"); return }
    setSaving(true)
    try {
      await fetch("/api/supplier-invoices", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          supplierId: siForm.supplierId,
          purchaseOrderId: siForm.purchaseOrderId || undefined,
          invoiceNumber: siForm.invoiceNumber || undefined,
          invoiceDate: siForm.invoiceDate || undefined,
          dueDate: siForm.dueDate || undefined,
          total: parseFloat(siForm.total),
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      toast.success("Supplier invoice created")
      setNewSIOpen(false)
      setSIForm({ supplierId: "", purchaseOrderId: "", invoiceNumber: "", invoiceDate: "", dueDate: "", total: "" })
      refetchAll()
    } catch {
      toast.error("Failed to create supplier invoice")
    } finally { setSaving(false) }
  }

  // ── Pay Supplier Invoice ──────────────────────────────────────────────────
  async function handleSIPayment() {
    if (!siPayDialog) return
    if (!siPayForm.amount || !siPayForm.paymentDate) { toast.error("Amount and date are required"); return }
    setSaving(true)
    try {
      await fetch(`/api/supplier-invoices/${siPayDialog.id}/payment`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          amount: parseFloat(siPayForm.amount),
          paymentDate: siPayForm.paymentDate,
          method: siPayForm.method,
          reference: siPayForm.reference || undefined,
        }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      toast.success("Payment recorded")
      setSIPayDialog(null)
      setSIPayForm({ amount: "", paymentDate: "", method: "Bank Transfer", reference: "" })
      refetchAll()
    } catch {
      toast.error("Failed to record payment")
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt size={24} weight="duotone" className="text-primary" />
            Finance
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Invoices, payments, and financial reports</p>
        </div>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="supplier-invoices">Supplier Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        {/* ──────────── INVOICES TAB ──────────── */}
        <TabsContent value="invoices" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Invoiced"
              value={formatINR(finReport?.totalInvoiced ?? 0)}
              icon={<CurrencyInr size={20} />}
              color="bg-blue-500/10 text-blue-500"
            />
            <StatCard
              title="Total Collected"
              value={formatINR(finReport?.totalCollected ?? 0)}
              icon={<ArrowDown size={20} />}
              color="bg-green-500/10 text-green-500"
            />
            <StatCard
              title="Outstanding AR"
              value={formatINR(finReport?.outstandingAR ?? 0)}
              icon={<Clock size={20} />}
              color="bg-amber-500/10 text-amber-500"
            />
            <StatCard
              title="Overdue AR"
              value={formatINR(finReport?.overdueAR ?? 0)}
              icon={<Warning size={20} />}
              color="bg-red-500/10 text-red-500"
            />
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{invoices.length} invoices total</p>
            <Button size="sm" onClick={() => setNewInvOpen(true)}>
              <Plus size={16} className="mr-1" /> New Invoice
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Sales Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInv ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">
                    <Spinner size={20} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No invoices yet
                  </TableCell></TableRow>
                ) : invoices.map(inv => {
                  const cust = customers.find(c => c.id === inv.customerId)
                  const meta = INV_STATUS[inv.status] ?? INV_STATUS.ISSUED
                  const outstanding = inv.total - inv.paidAmount
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs">{inv.id}</TableCell>
                      <TableCell className="font-medium">{cust?.name ?? inv.customerId}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{inv.salesOrderId ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(inv.issueDate)}</TableCell>
                      <TableCell>{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(inv.total)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatINR(inv.paidAmount)}</TableCell>
                      <TableCell className="text-right text-amber-600">{formatINR(outstanding)}</TableCell>
                      <TableCell>
                        {inv.status !== "PAID" && inv.status !== "VOID" && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setPayDialog(inv)
                            setPayForm({ amount: String(outstanding), paymentDate: new Date().toISOString().split("T")[0], method: "Bank Transfer", reference: "" })
                          }}>
                            Record Payment
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

        {/* ──────────── SUPPLIER INVOICES TAB ──────────── */}
        <TabsContent value="supplier-invoices" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{supplierInvoices.length} supplier invoices</p>
            <Button size="sm" onClick={() => setNewSIOpen(true)}>
              <Plus size={16} className="mr-1" /> New Supplier Invoice
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSI ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">
                    <Spinner size={20} className="animate-spin mx-auto text-muted-foreground" />
                  </TableCell></TableRow>
                ) : supplierInvoices.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No supplier invoices yet
                  </TableCell></TableRow>
                ) : supplierInvoices.map(si => {
                  const sup = suppliers.find(s => s.id === si.supplierId)
                  const meta = SI_STATUS[si.status] ?? SI_STATUS.RECEIVED
                  const outstanding = si.total - si.paidAmount
                  return (
                    <TableRow key={si.id}>
                      <TableCell className="font-mono text-xs">{si.id}</TableCell>
                      <TableCell className="font-medium">{sup?.name ?? si.supplierId}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{si.purchaseOrderId ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.color}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>{si.invoiceNumber ?? "—"}</TableCell>
                      <TableCell>{formatDate(si.dueDate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(si.total)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatINR(si.paidAmount)}</TableCell>
                      <TableCell className="text-right text-amber-600">{formatINR(outstanding)}</TableCell>
                      <TableCell>
                        {si.status !== "PAID" && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setSIPayDialog(si)
                            setSIPayForm({ amount: String(outstanding), paymentDate: new Date().toISOString().split("T")[0], method: "Bank Transfer", reference: "" })
                          }}>
                            Pay
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

        {/* ──────────── PAYMENTS TAB ──────────── */}
        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AR Aging */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowDown size={16} className="text-green-500" /> Accounts Receivable
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Invoiced</span>
                  <span className="font-semibold">{formatINR(finReport?.totalInvoiced ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Collected</span>
                  <span className="font-semibold text-green-600">{formatINR(finReport?.totalCollected ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="font-semibold text-amber-600">{formatINR(finReport?.outstandingAR ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overdue</span>
                  <span className="font-semibold text-red-600">{formatINR(finReport?.overdueAR ?? 0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* AP Aging */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowUp size={16} className="text-red-500" /> Accounts Payable
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Outstanding</span>
                  <span className="font-semibold text-amber-600">{formatINR(finReport?.totalAPOutstanding ?? 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Overdue</span>
                  <span className="font-semibold text-red-600">{formatINR(finReport?.overdueAP ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ──────────── REPORTS TAB ──────────── */}
        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Invoiced" value={formatINR(finReport?.totalInvoiced ?? 0)} icon={<CurrencyInr size={20} />} color="bg-blue-500/10 text-blue-500" />
            <StatCard title="Collected" value={formatINR(finReport?.totalCollected ?? 0)} icon={<CheckCircle size={20} />} color="bg-green-500/10 text-green-500" />
            <StatCard title="Outstanding AR" value={formatINR(finReport?.outstandingAR ?? 0)} icon={<Clock size={20} />} color="bg-amber-500/10 text-amber-500" />
            <StatCard title="AP Outstanding" value={formatINR(finReport?.totalAPOutstanding ?? 0)} icon={<ArrowUp size={20} />} color="bg-red-500/10 text-red-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={16} /> Top Unpaid Customers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!finReport?.topUnpaidCustomers?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No outstanding invoices</p>
                ) : (
                  <div className="space-y-2">
                    {finReport.topUnpaidCustomers.map((c, i) => (
                      <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                          <span className="text-sm font-medium">{c.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-red-600">{formatINR(c.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AR/AP Aging Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Receivables</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span>Outstanding</span><span className="font-medium text-amber-600">{formatINR(finReport?.outstandingAR ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Overdue</span><span className="font-medium text-red-600">{formatINR(finReport?.overdueAR ?? 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payables</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span>Outstanding</span><span className="font-medium text-amber-600">{formatINR(finReport?.totalAPOutstanding ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Overdue</span><span className="font-medium text-red-600">{formatINR(finReport?.overdueAP ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ──────────── NEW INVOICE DIALOG ──────────── */}
      <Dialog open={newInvOpen} onOpenChange={setNewInvOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer *</Label>
                <Select value={invForm.customerId} onValueChange={v => setInvForm(f => ({ ...f, customerId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sales Order (optional)</Label>
                <Input placeholder="SO-001" value={invForm.salesOrderId} onChange={e => setInvForm(f => ({ ...f, salesOrderId: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={invForm.dueDate} onChange={e => setInvForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" type="button" onClick={() =>
                  setInvLines(ls => [...ls, { description: "", qty: 1, unitPrice: 0, taxRate: 18 }])
                }>
                  <Plus size={14} className="mr-1" /> Add Line
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-24">Unit Price</TableHead>
                      <TableHead className="w-16">Tax %</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invLines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Input className="h-7 text-sm" value={line.description}
                            onChange={e => setInvLines(ls => ls.map((l, j) => j === i ? { ...l, description: e.target.value } : l))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-sm" type="number" min={1} value={line.qty}
                            onChange={e => setInvLines(ls => ls.map((l, j) => j === i ? { ...l, qty: Number(e.target.value) } : l))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-sm" type="number" min={0} value={line.unitPrice}
                            onChange={e => setInvLines(ls => ls.map((l, j) => j === i ? { ...l, unitPrice: Number(e.target.value) } : l))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-7 text-sm" type="number" min={0} max={100} value={line.taxRate}
                            onChange={e => setInvLines(ls => ls.map((l, j) => j === i ? { ...l, taxRate: Number(e.target.value) } : l))} />
                        </TableCell>
                        <TableCell>
                          {invLines.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() =>
                              setInvLines(ls => ls.filter((_, j) => j !== i))
                            }>
                              <Minus size={14} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-right text-sm">
                <span className="text-muted-foreground mr-2">Total:</span>
                <span className="font-bold">{formatINR(
                  invLines.reduce((s, l) => s + l.qty * l.unitPrice * (1 + l.taxRate / 100), 0)
                )}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewInvOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={saving}>
              {saving ? <Spinner size={16} className="animate-spin mr-2" /> : null}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────── RECORD PAYMENT DIALOG ──────────── */}
      <Dialog open={!!payDialog} onOpenChange={o => !o && setPayDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment — {payDialog?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm bg-muted rounded-lg p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{formatINR(payDialog?.total ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">{formatINR(payDialog?.paidAmount ?? 0)}</span></div>
              <div className="flex justify-between border-t mt-1 pt-1"><span className="text-muted-foreground">Outstanding</span><span className="font-bold text-amber-600">{formatINR((payDialog?.total ?? 0) - (payDialog?.paidAmount ?? 0))}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min={0} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date *</Label>
              <Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={payForm.method} onValueChange={v => setPayForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bank Transfer", "Cheque", "Cash", "UPI"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input placeholder="UTR / cheque number" value={payForm.reference} onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(null)}>Cancel</Button>
            <Button onClick={handlePayment} disabled={saving}>
              {saving ? <Spinner size={16} className="animate-spin mr-2" /> : null}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────── NEW SUPPLIER INVOICE DIALOG ──────────── */}
      <Dialog open={newSIOpen} onOpenChange={setNewSIOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Supplier Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={siForm.supplierId} onValueChange={v => setSIForm(f => ({ ...f, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Order (optional)</Label>
              <Input placeholder="purch-001" value={siForm.purchaseOrderId} onChange={e => setSIForm(f => ({ ...f, purchaseOrderId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier Invoice Number</Label>
              <Input placeholder="INV-2024-001" value={siForm.invoiceNumber} onChange={e => setSIForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice Date</Label>
                <Input type="date" value={siForm.invoiceDate} onChange={e => setSIForm(f => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={siForm.dueDate} onChange={e => setSIForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total Amount *</Label>
              <Input type="number" min={0} placeholder="0" value={siForm.total} onChange={e => setSIForm(f => ({ ...f, total: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSIOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSI} disabled={saving}>
              {saving ? <Spinner size={16} className="animate-spin mr-2" /> : null}
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ──────────── SUPPLIER INVOICE PAYMENT DIALOG ──────────── */}
      <Dialog open={!!siPayDialog} onOpenChange={o => !o && setSIPayDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pay Supplier Invoice — {siPayDialog?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm bg-muted rounded-lg p-3 space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-medium">{formatINR(siPayDialog?.total ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span className="font-medium text-green-600">{formatINR(siPayDialog?.paidAmount ?? 0)}</span></div>
              <div className="flex justify-between border-t mt-1 pt-1"><span className="text-muted-foreground">Outstanding</span><span className="font-bold text-amber-600">{formatINR((siPayDialog?.total ?? 0) - (siPayDialog?.paidAmount ?? 0))}</span></div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min={0} value={siPayForm.amount} onChange={e => setSIPayForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date *</Label>
              <Input type="date" value={siPayForm.paymentDate} onChange={e => setSIPayForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={siPayForm.method} onValueChange={v => setSIPayForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Bank Transfer", "Cheque", "Cash", "UPI"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input placeholder="UTR / cheque number" value={siPayForm.reference} onChange={e => setSIPayForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSIPayDialog(null)}>Cancel</Button>
            <Button onClick={handleSIPayment} disabled={saving}>
              {saving ? <Spinner size={16} className="animate-spin mr-2" /> : null}
              Save Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
