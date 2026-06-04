"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch, apiDelete } from "@/hooks/use-api"
import type { Customer, SalesOrder } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, PencilSimple, Trash, Users, Envelope, Phone, MapPin, Spinner, Buildings, Lock } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Advance", "COD"]

interface CustomerForm {
  name: string; contact: string; email: string; address: string; creditLimit: number; paymentTerms: string
}

const emptyForm: CustomerForm = { name: "", contact: "", email: "", address: "", creditLimit: 0, paymentTerms: "Net 30" }

function CustomerFormFields({ form, onChange }: { form: CustomerForm; onChange: (f: CustomerForm) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company Name *</label>
          <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. Zara India Pvt Ltd"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</label>
          <input value={form.contact} onChange={(e) => onChange({ ...form, contact: e.target.value })}
            placeholder="+91-99XXXXXXXX"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</label>
          <input type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })}
            placeholder="orders@company.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</label>
          <input value={form.address} onChange={(e) => onChange({ ...form, address: e.target.value })}
            placeholder="Street, City, PIN"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Credit Limit (₹)</label>
          <input type="number" min={0} value={form.creditLimit} onChange={(e) => onChange({ ...form, creditLimit: parseFloat(e.target.value) || 0 })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Terms</label>
          <select value={form.paymentTerms} onChange={(e) => onChange({ ...form, paymentTerms: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const { isSales, loading: loadingUser } = useUser()
  const { data: customersRes, loading, refetch } = useFetch<Customer[] | { data: Customer[] }>("/api/customers")
  const { data: ordersRes } = useFetch<{ data: SalesOrder[] }>("/api/sales-orders")

  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Unwrap both plain-array and paginated {data:[]} API shapes safely
  function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
    return []
  }
  const allCustomers = unwrap(customersRes)
  const allOrders = unwrap(ordersRes)
  const filtered = allCustomers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setForm(emptyForm); setEditTarget(null); setOpen(true) }
  function openEdit(c: Customer) {
    setForm({ name: c.name, contact: c.contact ?? "", email: c.email ?? "", address: c.address ?? "", creditLimit: c.creditLimit ?? 0, paymentTerms: c.paymentTerms ?? "Net 30" })
    setEditTarget(c); setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Company name is required"); return }
    setSaving(true)
    try {
      if (editTarget) {
        await apiPatch(`/api/customers/${editTarget.id}`, form)
        toast.success("Customer updated")
      } else {
        await apiPost("/api/customers", form)
        toast.success("Customer added")
      }
      setOpen(false)
      refetch()
    } catch {
      toast.error("Failed to save customer")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/customers/${deleteTarget.id}`)
      toast.success("Customer deleted")
      setDeleteTarget(null)
      refetch()
    } catch {
      toast.error("Failed to delete customer")
    }
  }

  function customerStats(id: string) {
    const custOrders = allOrders.filter((so) => so.customerId === id)
    const revenue = custOrders.reduce((s, so) => s + so.lines.reduce((ss, l) => ss + l.qty * l.unitPrice, 0), 0)
    return { orderCount: custOrders.length, revenue }
  }

  return (
    <div className="p-6 space-y-5 px-10  w-full mx-auto">
      <title>Customers | ShirtCo ERP</title>
      <div className="page-header">
        <div>
          <h1 className="section-title">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allCustomers.length} registered customers</p>
        </div>
        <Button
          onClick={openCreate}
          disabled={loadingUser || !isSales}
          className="gap-2 shadow-sm shadow-primary/20"
        >
          {(!loadingUser && !isSales) ? <Lock size={15} weight="bold" /> : <Plus size={15} weight="bold" />} Add Customer
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Total Customers</p>
          <p className="text-2xl font-heading font-bold">{allCustomers.length}</p>
          <p className="text-[11px] text-muted-foreground">Active accounts</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Total Credit Extended</p>
          <p className="text-2xl font-heading font-bold">{formatINR(allCustomers.reduce((s, c) => s + (c.creditLimit ?? 0), 0))}</p>
          <p className="text-[11px] text-muted-foreground">Combined credit limits</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Total Orders</p>
          <p className="text-2xl font-heading font-bold">{allOrders.length}</p>
          <p className="text-[11px] text-muted-foreground">Across all customers</p>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="w-full max-w-sm rounded-lg border border-input bg-card px-3 py-2 text-sm"
      />

      {/* Customer cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="shimmer h-44 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card py-16 text-center text-muted-foreground">
          <Users size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No customers found</p>
          <p className="text-sm mt-1">Add your first customer to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const { orderCount, revenue } = customerStats(c.id)
            const initials = c.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
            return (
              <div key={c.id} className="glass-card p-5 hover:shadow-md transition-shadow duration-200 group">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <Avatar className="h-10 w-10 rounded-full border border-border/50 shrink-0">
                    <AvatarImage src={`https://picsum.photos/seed/${c.id}/100/100`} alt={c.name} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-primary/30 to-violet-500/30 text-primary font-bold text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-[14px] truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">Credit: {formatINR(c.creditLimit ?? 0)} · {c.paymentTerms}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => openEdit(c)}
                      disabled={loadingUser || !isSales}
                    >
                      {(!loadingUser && !isSales) ? <Lock size={13} /> : <PencilSimple size={13} />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(c)}
                      disabled={loadingUser || !isSales}
                    >
                      {(!loadingUser && !isSales) ? <Lock size={13} /> : <Trash size={13} />}
                    </Button>
                  </div>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5 mb-4">
                  {c.contact && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Phone size={11} className="shrink-0" /> {c.contact}
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Envelope size={11} className="shrink-0" /> {c.email}
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <MapPin size={11} className="shrink-0" />
                      <span className="truncate">{c.address}</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 pt-3 border-t border-border/50">
                  <div className="flex-1 text-center">
                    <p className="text-[11px] text-muted-foreground">Orders</p>
                    <p className="text-sm font-bold">{orderCount}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 text-center">
                    <p className="text-[11px] text-muted-foreground">Revenue</p>
                    <p className="text-sm font-bold">{formatINR(revenue)}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editTarget ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <CustomerFormFields form={form} onChange={setForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              {editTarget ? "Save Changes" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Delete Customer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete <strong>{deleteTarget?.name}</strong>. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
