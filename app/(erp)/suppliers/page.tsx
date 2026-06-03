"use client"

import { useState } from "react"
import { useFetch, apiPost, apiPatch, apiDelete } from "@/hooks/use-api"
import type { Supplier, RawMaterial } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, PencilSimple, Trash, Buildings, Phone, Clock, Handshake, Spinner, Lock } from "@phosphor-icons/react"
import { toast } from "sonner"
import { useUser } from "@/hooks/use-user"

const PAYMENT_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Advance", "COD"]

interface SupplierForm {
  name: string; contact: string; leadTimeDays: number; paymentTerms: string
}

const emptyForm: SupplierForm = { name: "", contact: "", leadTimeDays: 7, paymentTerms: "Net 30" }

function SupplierFormFields({ form, onChange }: { form: SupplierForm; onChange: (f: SupplierForm) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Supplier Name *</label>
          <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="e.g. TextileCo India"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact (Phone/Email)</label>
          <input value={form.contact} onChange={(e) => onChange({ ...form, contact: e.target.value })}
            placeholder="+91-99XXXXXXXX or contact@textileco.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead Time (Days)</label>
          <input type="number" min={1} value={form.leadTimeDays} onChange={(e) => onChange({ ...form, leadTimeDays: parseInt(e.target.value) || 0 })}
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

export default function SuppliersPage() {
  const { isInventory, isProduction, loading: loadingUser } = useUser()
  const canManageSuppliers = isInventory || isProduction
  const { data: suppliers, loading, refetch } = useFetch<Supplier[]>("/api/suppliers")
  const { data: materials } = useFetch<RawMaterial[]>("/api/raw-materials")

  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState<SupplierForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const allSuppliers = suppliers ?? []
  const allMaterials = materials ?? []
  const filtered = allSuppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.contact?.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setForm(emptyForm); setEditTarget(null); setOpen(true) }
  function openEdit(s: Supplier) {
    setForm({ name: s.name, contact: s.contact ?? "", leadTimeDays: s.leadTimeDays ?? 7, paymentTerms: s.paymentTerms ?? "Net 30" })
    setEditTarget(s); setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Supplier name is required"); return }
    setSaving(true)
    try {
      if (editTarget) {
        await apiPatch(`/api/suppliers/${editTarget.id}`, form)
        toast.success("Supplier updated")
      } else {
        await apiPost("/api/suppliers", form)
        toast.success("Supplier added")
      }
      setOpen(false)
      refetch()
    } catch {
      toast.error("Failed to save supplier")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await apiDelete(`/api/suppliers/${deleteTarget.id}`)
      toast.success("Supplier deleted")
      setDeleteTarget(null)
      refetch()
    } catch {
      toast.error("Failed to delete supplier")
    }
  }

  const avgLeadTime = allSuppliers.length
    ? Math.round(allSuppliers.reduce((sum, s) => sum + (s.leadTimeDays ?? 0), 0) / allSuppliers.length)
    : 0

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <title>Suppliers | ShirtCo ERP</title>
      <div className="page-header">
        <div>
          <h1 className="section-title">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allSuppliers.length} supply partners</p>
        </div>
        <Button 
          onClick={openCreate} 
          disabled={loadingUser || !canManageSuppliers} 
          className="gap-2 shadow-sm shadow-primary/20"
        >
          {(!loadingUser && !canManageSuppliers) ? <Lock size={15} weight="bold" /> : <Plus size={15} weight="bold" />} Add Supplier
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Total Suppliers</p>
          <p className="text-2xl font-heading font-bold">{allSuppliers.length}</p>
          <p className="text-[11px] text-muted-foreground">Active supply base</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Avg Lead Time</p>
          <p className="text-2xl font-heading font-bold">{avgLeadTime} days</p>
          <p className="text-[11px] text-muted-foreground">Order to delivery duration</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground font-medium">Materials Sourced</p>
          <p className="text-2xl font-heading font-bold">{allMaterials.length}</p>
          <p className="text-[11px] text-muted-foreground">Catalog items active</p>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or contact..."
        className="w-full max-w-sm rounded-lg border border-input bg-card px-3 py-2 text-sm"
      />

      {/* Supplier cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="shimmer h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card py-16 text-center text-muted-foreground">
          <Buildings size={36} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No suppliers found</p>
          <p className="text-sm mt-1">Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const initials = s.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
            const sourcedCount = allMaterials.filter((m) => m.supplierId === s.id).length
            return (
              <div key={s.id} className="glass-card p-5 hover:shadow-md transition-shadow duration-200 group">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="size-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-semibold text-[14px] truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">ID: {s.id}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon-xs" 
                      onClick={() => openEdit(s)}
                      disabled={loadingUser || !canManageSuppliers}
                    >
                      {(!loadingUser && !canManageSuppliers) ? <Lock size={13} /> : <PencilSimple size={13} />}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon-xs" 
                      className="text-destructive hover:text-destructive" 
                      onClick={() => setDeleteTarget(s)}
                      disabled={loadingUser || !canManageSuppliers}
                    >
                      {(!loadingUser && !canManageSuppliers) ? <Lock size={13} /> : <Trash size={13} />}
                    </Button>
                  </div>
                </div>

                {/* Contact & Terms */}
                <div className="space-y-1.5 mb-4">
                  {s.contact && (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Phone size={11} className="shrink-0" /> {s.contact}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Clock size={11} className="shrink-0" /> Lead time: {s.leadTimeDays} days
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Handshake size={11} className="shrink-0" /> Terms: {s.paymentTerms}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 pt-3 border-t border-border/50">
                  <div className="flex-1 text-center">
                    <p className="text-[11px] text-muted-foreground">Materials Supplied</p>
                    <p className="text-sm font-bold">{sourcedCount}</p>
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
            <DialogTitle className="font-heading">{editTarget ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <SupplierFormFields form={form} onChange={setForm} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
              {saving && <Spinner size={14} className="animate-spin mr-1" />}
              {editTarget ? "Save Changes" : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Delete Supplier?</DialogTitle>
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
