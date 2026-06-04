"use client"

import { useFetch } from "@/hooks/use-api"
import type { Customer, Product, SalesOrder } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ShoppingCart, Package, Users, Warning, CheckCircle, ArrowRight } from "@phosphor-icons/react"
import Link from "next/link"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
  if (!res) return []
  if (Array.isArray(res)) return res
  if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
  return []
}

function SimpleBarChart({ sos }: { sos: SalesOrder[] }) {
  const delivered = [...sos]
    .filter((o) => o.status === "DELIVERED")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-7)

  if (delivered.length === 0) {
    return (
      <div className="h-[180px] w-full flex items-center justify-center text-muted-foreground text-sm">
        No fulfilled orders yet
      </div>
    )
  }

  const maxVal = Math.max(...delivered.map((o) => o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)), 1)

  return (
    <div className="h-[180px] w-full flex items-end gap-2 px-1">
      {delivered.map((o, i) => {
        const val = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
        const pct = (val / maxVal) * 100
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${o.id}: ${formatINR(val)}`}>
            <span className="text-[9px] text-muted-foreground font-bold opacity-0 group-hover:opacity-100 transition-opacity">
              {formatINR(val)}
            </span>
            <div
              className="w-full rounded-t-md bg-primary/70 group-hover:bg-primary transition-colors"
              style={{ height: `${Math.max(4, pct * 1.4)}px` }}
            />
            <span className="text-[9px] text-muted-foreground font-mono truncate max-w-full">
              {o.id.split("-").pop()}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:           "bg-muted/80 text-muted-foreground",
  SUBMITTED:       "bg-blue-500/15 text-blue-500",
  INVENTORY_CHECK: "bg-yellow-500/15 text-yellow-500",
  APPROVED:        "bg-emerald-500/15 text-emerald-500",
  IN_PRODUCTION:   "bg-violet-500/15 text-violet-500",
  NEEDS_RESTOCK:   "bg-amber-500/15 text-amber-500",
  DELIVERED:       "bg-green-500/15 text-green-500",
  CANCELLED:       "bg-destructive/15 text-destructive",
}

export default function DashboardPage() {
  const { data: ordersRes,   loading: lo } = useFetch<{ data: SalesOrder[] }>("/api/sales-orders")
  const { data: productsRes }              = useFetch<{ data: Product[] }>("/api/products")
  const { data: customersRes }             = useFetch<Customer[] | { data: Customer[] }>("/api/customers")

  const sos   = unwrap(ordersRes)
  const prods = unwrap(productsRes)
  const custs = unwrap(customersRes as { data: Customer[] } | Customer[])

  const pending       = sos.filter((s) => ["DRAFT","SUBMITTED","INVENTORY_CHECK","APPROVED","IN_PRODUCTION"].includes(s.status))
  const needsRestock  = sos.filter((s) => s.status === "NEEDS_RESTOCK")
  const fulfilled     = sos.filter((s) => s.status === "DELIVERED")
  const revenue       = fulfilled.reduce((sum, so) => sum + so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 0)
  const inStockProds  = prods.filter((p) => p.currentStock >= 10)
  const lowStockProds = prods.filter((p) => p.currentStock < 10)

  const recentOrders = [...sos]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)

  return (
    <div className="flex-1 space-y-5 p-6 max-w-[1400px] mx-auto">
      <title>Dashboard | ShirtCo ERP</title>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening at ShirtCo today</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
              <>
                <div className="text-2xl font-bold">{pending.length}</div>
                <p className="text-xs text-muted-foreground">Awaiting stock check</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={needsRestock.length > 0 ? "border-amber-500/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              {needsRestock.length > 0 && <Warning size={14} className="text-amber-500" weight="fill" />}
              Needs Restock
            </CardTitle>
            <Warning className={cn("h-4 w-4", needsRestock.length > 0 ? "text-amber-500" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
              <>
                <div className={cn("text-2xl font-bold", needsRestock.length > 0 && "text-amber-500")}>
                  {needsRestock.length}
                </div>
                <Link href="/orders" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  View orders <ArrowRight size={10} />
                </Link>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
              <>
                <div className="text-2xl font-bold text-emerald-500">{formatINR(revenue)}</div>
                <p className="text-xs text-muted-foreground">{fulfilled.length} fulfilled orders</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={lowStockProds.length > 0 ? "border-amber-500/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products in Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
              <>
                <div className="text-2xl font-bold">{inStockProds.length} / {prods.length}</div>
                <p className="text-xs text-muted-foreground">
                  {lowStockProds.length > 0
                    ? <span className="text-amber-500 font-semibold">{lowStockProds.length} low stock</span>
                    : "All well-stocked"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts + Recent Orders */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Bar chart */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Recent Fulfilled Orders</CardTitle>
            <CardDescription>Revenue from the last 7 fulfilled orders</CardDescription>
          </CardHeader>
          <CardContent>
            {lo
              ? <div className="h-[180px] w-full bg-muted animate-pulse rounded-lg" />
              : <SimpleBarChart sos={sos} />}
          </CardContent>
        </Card>

        {/* Recent orders list */}
        <Card className="col-span-3 flex flex-col">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>Latest {recentOrders.length} orders</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-4">
              {lo ? (
                [...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="h-9 w-9 bg-muted animate-pulse rounded-full" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))
              ) : recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No orders yet</p>
              ) : (
                recentOrders.map((so) => {
                  const customer = custs.find((c) => c.id === so.customerId)
                  const total = so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                  const initials = (customer?.name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  const statusColor = STATUS_COLORS[so.status] ?? "bg-muted text-muted-foreground"
                  return (
                    <div key={so.id} className="flex items-center group">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="ml-3 space-y-0.5 flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-none truncate">
                          {customer?.name ?? "Unknown"}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground truncate">{formatDate(so.createdAt)}</p>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor}`}>
                            {so.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                      <div className="ml-auto font-semibold text-sm">
                        {formatINR(total)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low stock alert section */}
      {lowStockProds.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Warning size={16} weight="fill" /> Low Stock Alert
            </CardTitle>
            <CardDescription>These products are running low. Consider restocking.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {lowStockProds.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-3"
                >
                  <div className="size-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Package size={16} className="text-amber-500" weight="fill" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-xs text-amber-500 font-bold">{p.currentStock} left</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/products" className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
              Go to Products <ArrowRight size={11} />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Customer count */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{custs.length}</div>
            <Link href="/customers" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
              Manage customers <ArrowRight size={10} />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
