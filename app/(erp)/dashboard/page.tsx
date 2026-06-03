"use client"

import { useFetch } from "@/hooks/use-api"
import type { Customer, Product, RawMaterial, SalesOrder, ProductionOrder, Shipment } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ShoppingCart, Factory, Package, Truck } from "@phosphor-icons/react"
import Link from "next/link"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT:           "bg-muted/80 text-muted-foreground",
  SUBMITTED:       "bg-blue-500/15 text-blue-500",
  INVENTORY_CHECK: "bg-yellow-500/15 text-yellow-500",
  APPROVED:        "bg-emerald-500/15 text-emerald-500",
  IN_PRODUCTION:   "bg-violet-500/15 text-violet-500",
  READY_TO_SHIP:   "bg-cyan-500/15 text-cyan-500",
  SHIPPED:         "bg-indigo-500/15 text-indigo-400",
  DELIVERED:       "bg-green-500/15 text-green-500",
  CANCELLED:       "bg-destructive/15 text-destructive",
}

function BarChart({ sos }: { sos: SalesOrder[] }) {
  const chartWidth = 1000
  const chartHeight = 350
  
  const chartOrders = [...sos]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-6)

  const maxVal = Math.max(...chartOrders.map(o => o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)), 100000)
  
  if (chartOrders.length === 0) {
    return <div className="h-[350px] w-full flex items-center justify-center text-muted-foreground">No sales data available</div>
  }

  return (
    <div className="h-[350px] w-full mt-4">
      <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
        {/* Y Axis Grid/Labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = chartHeight - 20 - pct * (chartHeight - 40)
          const labelVal = maxVal * pct
          return (
            <g key={i}>
              <line x1="60" y1={y} x2={chartWidth} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3,3" opacity="0.4" />
              <text x="50" y={y + 4} textAnchor="end" fill="currentColor" fontSize="12" className="text-muted-foreground font-mono">
                ₹{(labelVal / 1000).toFixed(0)}k
              </text>
            </g>
          )
        })}
        {/* Bars */}
        {chartOrders.map((o, i) => {
          const val = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
          const barWidth = 45
          const spacing = (chartWidth - 60) / Math.max(1, chartOrders.length)
          const x = 60 + spacing / 2 + i * spacing - barWidth / 2
          const height = (val / maxVal) * (chartHeight - 40)
          const y = chartHeight - 20 - height
          return (
            <g key={i} className="group cursor-pointer">
              <rect x={x} y={y} width={barWidth} height={height} rx="4" fill="currentColor" className="text-slate-900 dark:text-slate-100 transition-colors group-hover:text-primary" />
              <text x={x + barWidth / 2} y={chartHeight} textAnchor="middle" fill="currentColor" fontSize="10" className="text-muted-foreground font-bold uppercase">
                {o.id.split('-').pop()}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function DashboardPage() {
  const { data: ordersRes,    loading: lo } = useFetch<{ data: SalesOrder[] }>("/api/sales-orders")
  const { data: productsRes }               = useFetch<{ data: Product[] }>("/api/products")
  const { data: rawMatsRes }                = useFetch<{ data: RawMaterial[] }>("/api/raw-materials")
  const { data: prodOrdersRes }             = useFetch<{ data: ProductionOrder[] }>("/api/production-orders")
  const { data: shipmentsRes }              = useFetch<{ data: Shipment[] }>("/api/shipments")
  const { data: customersRes }              = useFetch<Customer[] | { data: Customer[] }>("/api/customers")

  // All APIs now return { data: [...], total, page, limit } — unwrap each safely
  function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
    if (!res) return []
    if (Array.isArray(res)) return res
    if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
    return []
  }

  const sos   = unwrap(ordersRes)
  const prods = unwrap(productsRes)
  const rms   = unwrap(rawMatsRes)
  const pos   = unwrap(prodOrdersRes)
  const shps  = unwrap(shipmentsRes)
  const custs = unwrap(customersRes as { data: Customer[] } | Customer[])

  const mtdRevenue = sos.filter((s) => s.status === "DELIVERED")
    .reduce((sum, so) => sum + so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 0)

  const activeProduction = pos.filter((p) => ["PLANNED","RELEASED","MATERIAL_RESERVED","IN_PROGRESS","QUALITY_CHECK"].includes(p.status)).length
  const inventoryValue = prods.reduce((s, p) => s + p.currentStock * p.price, 0)
  const pendingShipments = shps.filter((s) => ["PACKING","DISPATCHED","IN_TRANSIT"].includes(s.status)).length

  const recentOrders = [...sos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6)

  return (
    <div className="flex-1 space-y-4 p-8 pt-6 max-w-[1400px] mx-auto">
      <title>Dashboard | ShirtCo ERP</title>

      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening at ShirtCo today</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200">
            Download Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-slate-100/50 dark:bg-slate-800/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics" disabled>Analytics</TabsTrigger>
          <TabsTrigger value="reports" disabled>Reports</TabsTrigger>
          <TabsTrigger value="notifications" disabled>Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue MTD</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
                  <>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatINR(mtdRevenue)}</div>
                    <p className="text-xs text-muted-foreground">From delivered orders</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
                  <>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{sos.length}</div>
                    <p className="text-xs text-muted-foreground">{sos.filter((s) => s.status === "DELIVERED").length} delivered</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Production Active</CardTitle>
                <Factory className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
                  <>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{activeProduction}</div>
                    <p className="text-xs text-muted-foreground">Orders in progress</p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Finished Goods Value</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {lo ? <div className="h-8 w-24 bg-muted animate-pulse rounded" /> : (
                  <>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatINR(inventoryValue)}</div>
                    <p className="text-xs text-muted-foreground">Total FG stock value</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">Recent Sales Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                {lo ? <div className="h-[350px] w-full bg-muted animate-pulse rounded-lg" /> : <BarChart sos={sos} />}
              </CardContent>
            </Card>

            <Card className="col-span-3 lg:col-span-3 flex flex-col">
              <CardHeader>
                <CardTitle className="text-slate-900 dark:text-white">Recent Sales</CardTitle>
                <CardDescription>
                  You received {recentOrders.length} sales orders recently.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="space-y-6">
                  {lo ? (
                    [...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <div className="h-9 w-9 bg-muted animate-pulse rounded-full" />
                        <div className="space-y-2 flex-1">
                          <div className="h-4 w-1/3 bg-muted animate-pulse rounded" />
                          <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                        </div>
                      </div>
                    ))
                  ) : (
                    recentOrders.map((so) => {
                      const customer = custs.find((c) => c.id === so.customerId)
                      const total = so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                      const initials = (customer?.name ?? "U").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                      return (
                        <div key={so.id} className="flex items-center group">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="ml-4 space-y-1 flex-1 min-w-0">
                            <p className="text-sm font-medium leading-none text-slate-900 dark:text-white truncate">
                              {customer?.name ?? "Unknown Customer"}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground truncate">{so.id} · {formatDate(so.createdAt)}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${STATUS_COLORS[so.status] ?? ""}`}>
                                {so.status.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                          <div className="ml-auto font-medium text-slate-900 dark:text-white">
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
