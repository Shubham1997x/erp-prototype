"use client"

import { useFetch } from "@/hooks/use-api"
import type { Customer, Product, SalesOrder } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ShoppingCart, Users, Warning, CheckCircle, ArrowRight, TrendUp, Package, Sparkle } from "@phosphor-icons/react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getCompanyImageUrl } from "@/lib/avatar-utils"

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

function formatDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 24 && hours > 0) return `${hours}h ago`
  if (hours === 0) return 'Just now'
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
}

function unwrap<T>(res: { data: T[] } | T[] | null | undefined): T[] {
  if (!res) return []
  if (Array.isArray(res)) return res
  if (Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data
  return []
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted/60 text-muted-foreground border border-border/40",
  SUBMITTED: "bg-primary/20 text-primary border border-primary/20",
  INVENTORY_CHECK: "bg-primary/20 text-primary border border-primary/20",
  APPROVED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  IN_PRODUCTION: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
  NEEDS_RESTOCK: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20",
  DELIVERED: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
  CANCELLED: "bg-destructive/20 text-destructive/90 dark:text-destructive border border-destructive/20",
}

const ORDER_STATUS_CHART: Record<string, { label: string; color: string }> = {
  DELIVERED: { label: "Delivered", color: "var(--chart-1)" },
  PAID: { label: "Paid", color: "oklch(0.55 0.16 145)" },
  INVOICED: { label: "Invoiced", color: "oklch(0.6 0.14 165)" },
  SHIPPED: { label: "Shipped", color: "oklch(0.62 0.14 240)" },
  READY_TO_SHIP: { label: "Ready to ship", color: "oklch(0.68 0.12 185)" },
  APPROVED: { label: "Approved", color: "var(--chart-2)" },
  IN_PRODUCTION: { label: "In production", color: "oklch(0.58 0.2 305)" },
  PARTIALLY_FULFILLED: { label: "Partial", color: "oklch(0.62 0.18 320)" },
  NEEDS_RESTOCK: { label: "Needs restock", color: "oklch(0.72 0.16 75)" },
  INVENTORY_CHECK: { label: "Stock check", color: "oklch(0.65 0.12 255)" },
  SUBMITTED: { label: "Submitted", color: "var(--chart-4)" },
  DRAFT: { label: "Draft", color: "oklch(0.78 0.01 286)" },
  CREDIT_HOLD: { label: "Credit hold", color: "oklch(0.7 0.18 55)" },
  DISPUTED: { label: "Disputed", color: "oklch(0.65 0.2 45)" },
  CANCELLED: { label: "Cancelled", color: "var(--destructive)" },
}

export default function DashboardPage() {
  const { data: ordersRes, loading: lo } = useFetch<{ data: SalesOrder[] }>("/api/sales-orders")
  const { data: productsRes } = useFetch<{ data: Product[] }>("/api/products")
  const { data: customersRes } = useFetch<Customer[] | { data: Customer[] }>("/api/customers")

  const sos = unwrap(ordersRes)
  const prods = unwrap(productsRes)
  const custs = unwrap(customersRes as { data: Customer[] } | Customer[])

  // KPIs
  const pending = sos.filter((s) => ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION"].includes(s.status))
  const needsRestock = sos.filter((s) => s.status === "NEEDS_RESTOCK")
  const fulfilled = sos.filter((s) => s.status === "DELIVERED")
  const revenue = fulfilled.reduce((sum, so) => sum + so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), 0)

  const inStockProds = prods.filter((p) => p.currentStock >= 10)
  const lowStockProds = prods.filter((p) => p.currentStock > 0 && p.currentStock < 10)
  const outOfStockProds = prods.filter((p) => p.currentStock === 0)

  const recentOrders = [...sos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8)

  // Chart 1: Smooth Area Sparkline for Revenue
  const trendData = (() => {
    const data = []
    const base = revenue > 0 ? revenue / 7 : 50000
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const variance = (Math.sin(i * 1.5) * 0.4 + 0.8)
      data.push({
        date: d.toLocaleDateString("en-US", { weekday: "short" }),
        revenue: Math.floor(base * variance)
      })
    }
    return data
  })()

  const trendConfig = {
    revenue: { label: "Revenue", color: "var(--primary)" }
  } satisfies ChartConfig

  // Chart 2: Order Status Donut
  const statusData = (() => {
    const counts: Record<string, number> = {}
    sos.forEach((so) => {
      counts[so.status] = (counts[so.status] || 0) + 1
    })
    return Object.entries(counts).map(([status, count], index) => {
      const meta = ORDER_STATUS_CHART[status]
      const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
      return { name: meta?.label || status, value: count, fill: meta?.color ?? palette[index % palette.length] }
    })
  })()

  const statusTotal = statusData.reduce((sum, item) => sum + item.value, 0)

  const stockHealthPct = prods.length > 0 ? Math.round((inStockProds.length / prods.length) * 100) : 0

  return (
    <div className="relative min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-10 max-w-[1800px] mx-auto w-full overflow-hidden flex flex-col gap-8">
      <title>Command Center | ShirtCo</title>

      {/* Animated Ambient Background Effects */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[15%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] mix-blend-screen opacity-70 animate-pulse duration-[10000ms]" />
        <div className="absolute top-[20%] -right-[15%] w-[40%] h-[40%] rounded-full bg-emerald-500/15 blur-[100px] mix-blend-screen opacity-50" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] rounded-full bg-indigo-500/15 blur-[120px] mix-blend-screen opacity-60" />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 page-header relative z-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
            Command Center

          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Good morning. You have <strong className="text-foreground">{pending.length} pending orders</strong> to fulfill and your inventory health is <strong className={stockHealthPct > 80 ? "text-emerald-500" : "text-amber-500"}>{stockHealthPct}%</strong>.
          </p>
        </div>

      </div>

      {/* ── Bento Grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-6 gap-5 z-10">

        {/* Main Revenue Hero Card (Spans 2x2 on large screens) */}
        <Card className="glass-card md:col-span-2 xl:col-span-2 xl:row-span-2 flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="pb-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Revenue</CardTitle>
            <div className="mt-2 text-5xl font-black tracking-tighter gradient-text">
              {lo ? <div className="h-12 w-48 shimmer" /> : formatINR(revenue)}
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm font-medium text-emerald-500">
              <TrendUp weight="bold" /> +12.5% vs last month
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 mt-6 relative z-10 min-h-[160px]">
            <ChartContainer config={trendConfig} className="h-full w-full absolute inset-x-0 bottom-0">
              <BarChart data={trendData} margin={{ top: 10, left: 10, right: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillRevBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <Bar
                  dataKey="revenue"
                  fill="url(#fillRevBar)"
                  radius={[6, 6, 0, 0]}
                  barSize={40}
                  animationDuration={1500}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Pending Orders */}
        <Card className="glass-card md:col-span-1 xl:col-span-1 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-primary" weight="duotone" />
            </div>
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-10 w-16 shimmer" /> : (
              <div className="text-4xl font-bold tracking-tight">{pending.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2 font-medium">Awaiting processing</p>
          </CardContent>
        </Card>

        {/* Blocked Orders */}
        <Card className="glass-card md:col-span-1 xl:col-span-1 flex flex-col justify-between hover:border-amber-500/40 transition-colors group">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked</CardTitle>
            <div className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-colors", needsRestock.length > 0 ? "bg-amber-500/15" : "bg-muted")}>
              <Warning className={cn("h-4 w-4", needsRestock.length > 0 ? "text-amber-500" : "text-muted-foreground")} weight="duotone" />
            </div>
          </CardHeader>
          <CardContent>
            {lo ? <div className="h-10 w-16 shimmer" /> : (
              <div className={cn("text-4xl font-bold tracking-tight", needsRestock.length > 0 && "text-amber-500")}>
                {needsRestock.length}
              </div>
            )}
            <Link href="/orders" className="text-xs text-muted-foreground group-hover:text-amber-500 transition-colors flex items-center gap-1 mt-2 font-medium">
              Needs restock <ArrowRight size={12} />
            </Link>
          </CardContent>
        </Card>

        {/* Active Customers */}
        <Card className="glass-card md:col-span-2 xl:col-span-2 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-0 bottom-0 opacity-[0.03] pointer-events-none scale-150 translate-x-1/4 translate-y-1/4">
            <Users weight="fill" className="w-64 h-64" />
          </div>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Client Base</CardTitle>
            <div className="flex -space-x-2">
              {custs.slice(0, 4).map((c, i) => (
                <Avatar key={c.id} className="w-8 h-8 border-2 border-background shadow-sm z-10" style={{ zIndex: 10 - i }}>
                  <AvatarImage src={getCompanyImageUrl(c.id)} />
                  <AvatarFallback className="bg-primary/20 text-[10px]">{c.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
              {custs.length > 4 && (
                <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium z-0">
                  +{custs.length - 4}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {lo ? <div className="h-10 w-16 shimmer" /> : (
              <div className="text-4xl font-bold tracking-tight">{custs.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2 font-medium">Registered businesses</p>
          </CardContent>
        </Card>

        {/* Inventory Dial */}
        <Card className="glass-card md:col-span-2 xl:col-span-2 flex flex-col sm:flex-row items-center p-6 gap-6 relative overflow-hidden group">
          <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10 transition-transform group-hover:scale-110" />
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90 transform">
              <circle cx="56" cy="56" r="46" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-muted/40" />
              <circle
                cx="56" cy="56" r="46"
                stroke="currentColor" strokeWidth="10" fill="transparent"
                strokeDasharray="289"
                strokeDashoffset={289 - (289 * stockHealthPct) / 100}
                className={stockHealthPct > 80 ? "text-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]" : "text-amber-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]"}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-2xl font-black tracking-tight">{stockHealthPct}%</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Health</span>
            </div>
          </div>
          <div className="flex-1 w-full">
            <CardTitle className="text-lg font-bold mb-1 flex items-center gap-2">
              <Package weight="duotone" className="text-primary w-5 h-5" /> 
              Stock Health
            </CardTitle>
            <CardDescription className="text-xs mb-4">
              Inventory saturation across <strong className="text-foreground">{prods.length}</strong> active SKUs.
            </CardDescription>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col bg-muted/30 rounded-lg p-2 border border-border/50">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" /> 
                  Healthy
                </span>
                <span className="font-bold text-lg">{inStockProds.length}</span>
              </div>
              <div className="flex flex-col bg-muted/30 rounded-lg p-2 border border-border/50">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.8)]" /> 
                  Low
                </span>
                <span className="font-bold text-lg">{lowStockProds.length}</span>
              </div>
              <div className="flex flex-col bg-muted/30 rounded-lg p-2 border border-border/50">
                <span className="text-muted-foreground flex items-center gap-1.5 font-medium mb-1">
                  <span className="w-2 h-2 rounded-full bg-destructive shadow-[0_0_4px_rgba(239,68,68,0.8)]" /> 
                  Out
                </span>
                <span className="font-bold text-lg">{outOfStockProds.length}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Pipeline Distribution */}
        <Card className="glass-card md:col-span-2 xl:col-span-2 flex flex-col">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center gap-4 mt-4">
            <div className="w-[120px] h-[120px] shrink-0 relative">
              {statusData.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      innerRadius={40}
                      outerRadius={55}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--card)', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ color: 'var(--foreground)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="flex-1 space-y-2">
              {statusData.sort((a, b) => b.value - a.value).slice(0, 4).map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
                    <span className="font-medium truncate max-w-[80px]">{item.name}</span>
                  </div>
                  <span className="text-muted-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── Lower Section ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 z-10 pb-10">

        {/* Activity Feed */}
        <Card className="glass-card xl:col-span-3 flex flex-col">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Live Activity Feed</CardTitle>
                <CardDescription>Recent orders and status updates</CardDescription>
              </div>
              <Link href="/orders" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-xs uppercase text-muted-foreground font-semibold">
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">Customer</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-right rounded-tr-xl">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {lo ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4"><div className="h-6 w-32 shimmer" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-20 shimmer rounded-full" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 shimmer" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-6 w-20 shimmer ml-auto" /></td>
                    </tr>
                  ))
                ) : recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">No recent activity</td>
                  </tr>
                ) : (
                  recentOrders.map((so) => {
                    const customer = custs.find((c) => c.id === so.customerId)
                    const total = so.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
                    const initials = (customer?.name ?? "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                    const statusColor = STATUS_COLORS[so.status] ?? "bg-muted text-muted-foreground"

                    return (
                      <tr key={so.id} data-slot="table-row" className="group hover:bg-primary/5 transition-colors cursor-pointer">
                        <td className="px-6 py-4 font-medium">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0 border-2 border-background shadow-sm transition-transform group-hover:scale-110">
                              {customer?.id && <AvatarImage src={getCompanyImageUrl(customer.id)} alt={customer.name} className="object-cover" />}
                              <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-semibold text-foreground">{customer?.name ?? "Unknown"}</div>
                              <div className="text-[10px] text-muted-foreground">{so.id.split('-')[0]}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
                            {so.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {formatDate(so.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold">
                          {formatINR(total)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
