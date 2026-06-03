"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/use-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Package, ChartBar, Factory, Receipt, Warning, CheckCircle,
  Spinner, ArrowDown, ArrowUp, CurrencyInr, Clock, Users, TrendUp,
} from "@phosphor-icons/react"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}
function fmtPct(v: number) { return `${v.toFixed(1)}%` }
function fmtNum(v: number) {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
  return v.toLocaleString("en-IN")
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface InventoryReport {
  rawMaterials: {
    id: string; name: string; unit: string; currentStock: number; reservedStock: number;
    availableStock: number; reorderPoint: number; unitCost: number; stockValue: number;
    status: string;
  }[]
  finishedGoods: {
    id: string; name: string; sku: string; unitOfMeasure: string; currentStock: number;
    reservedStock: number; standardCost: number; price: number; margin: number; category: string;
  }[]
  summary: {
    rawMaterialValue: number; finishedGoodsValue: number; lowStockCount: number; outOfStockCount: number;
  }
}

interface SalesReport {
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  otdRate: number
  byStatus: Record<string, number>
  topCustomers: { id: string; name: string; orderCount: number; totalRevenue: number }[]
}

interface ProductionReport {
  activeOrders: number
  completedOrders: number
  totalProduced: number
  scrapRate: number
  byStatus: Record<string, number>
  avgCycleTime: number | null
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

// ─── Stat Card ───────────────────────────────────────────────────────────────

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

// ─── Status Badge Breakdown ──────────────────────────────────────────────────

const SO_STATUS_COLORS: Record<string, string> = {
  DRAFT:            "bg-muted text-muted-foreground",
  SUBMITTED:        "bg-blue-500/15 text-blue-500",
  INVENTORY_CHECK:  "bg-yellow-500/15 text-yellow-500",
  APPROVED:         "bg-emerald-500/15 text-emerald-500",
  IN_PRODUCTION:    "bg-violet-500/15 text-violet-500",
  READY_TO_SHIP:    "bg-cyan-500/15 text-cyan-500",
  SHIPPED:          "bg-indigo-500/15 text-indigo-400",
  DELIVERED:        "bg-green-500/15 text-green-500",
  CANCELLED:        "bg-destructive/15 text-destructive",
}

const PROD_STATUS_COLORS: Record<string, string> = {
  PLANNED:            "bg-muted text-muted-foreground",
  RELEASED:           "bg-blue-500/15 text-blue-500",
  AWAITING_MATERIALS: "bg-yellow-500/15 text-yellow-500",
  MATERIAL_RESERVED:  "bg-cyan-500/15 text-cyan-500",
  IN_PROGRESS:        "bg-violet-500/15 text-violet-500",
  QUALITY_CHECK:      "bg-amber-500/15 text-amber-500",
  COMPLETED:          "bg-green-500/15 text-green-500",
  ON_HOLD:            "bg-orange-500/15 text-orange-500",
  CANCELLED:          "bg-destructive/15 text-destructive",
}

const RM_STATUS_COLORS: Record<string, string> = {
  OUT_OF_STOCK:  "bg-red-500/15 text-red-500",
  LOW_STOCK:     "bg-amber-500/15 text-amber-500",
  ADEQUATE:      "bg-green-500/15 text-green-500",
}

function StatusBreakdown({ data, colors, total }: {
  data: Record<string, number>; colors: Record<string, string>; total: number
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(data).sort(([, a], [, b]) => b - a).map(([status, count]) => (
        <div key={status} className="flex items-center gap-1.5">
          <Badge variant="outline" className={colors[status] ?? "bg-muted text-muted-foreground"}>
            {status.replace(/_/g, " ")}
          </Badge>
          <span className="text-sm font-semibold">{count}</span>
          {total > 0 && <span className="text-xs text-muted-foreground">({Math.round(count / total * 100)}%)</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [salesFrom, setSalesFrom] = useState("")
  const [salesTo, setSalesTo] = useState("")
  const [salesQuery, setSalesQuery] = useState("")

  const { data: invReport, loading: loadingInv } = useFetch<InventoryReport>("/api/reports/inventory")
  const { data: salesReport, loading: loadingSales, refetch: refetchSales } =
    useFetch<SalesReport>(`/api/reports/sales${salesQuery}`)
  const { data: prodReport, loading: loadingProd } = useFetch<ProductionReport>("/api/reports/production")
  const { data: finReport, loading: loadingFin } = useFetch<FinanceReport>("/api/reports/finance")

  function applyDateFilter() {
    const params = new URLSearchParams()
    if (salesFrom) params.set("from", salesFrom)
    if (salesTo) params.set("to", salesTo)
    const q = params.toString()
    setSalesQuery(q ? `?${q}` : "")
    refetchSales()
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ChartBar size={24} weight="duotone" className="text-primary" />
          Reports & Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Real-time insights across all modules</p>
      </div>

      <Tabs defaultValue="inventory">
        <TabsList className="mb-4">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
        </TabsList>

        {/* ──────────── INVENTORY TAB ──────────── */}
        <TabsContent value="inventory" className="space-y-6">
          {loadingInv ? (
            <div className="flex justify-center py-12"><Spinner size={24} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="RM Value"
                  value={formatINR(invReport?.summary.rawMaterialValue ?? 0)}
                  icon={<Package size={20} />}
                  color="bg-blue-500/10 text-blue-500"
                />
                <StatCard
                  title="FG Value"
                  value={formatINR(invReport?.summary.finishedGoodsValue ?? 0)}
                  icon={<Package size={20} />}
                  color="bg-green-500/10 text-green-500"
                />
                <StatCard
                  title="Low Stock Items"
                  value={invReport?.summary.lowStockCount ?? 0}
                  icon={<Warning size={20} />}
                  color="bg-amber-500/10 text-amber-500"
                />
                <StatCard
                  title="Out of Stock"
                  value={invReport?.summary.outOfStockCount ?? 0}
                  icon={<Warning size={20} />}
                  color="bg-red-500/10 text-red-500"
                />
              </div>

              {/* Raw Materials Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Raw Materials</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">In Stock</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Reorder Pt.</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Stock Value</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(invReport?.rawMaterials ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No raw materials</TableCell></TableRow>
                        ) : (invReport?.rawMaterials ?? []).map(rm => (
                          <TableRow key={rm.id}>
                            <TableCell className="font-medium">{rm.name}</TableCell>
                            <TableCell>{rm.unit}</TableCell>
                            <TableCell className="text-right">{rm.currentStock.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-amber-600">{rm.reservedStock.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">{rm.availableStock.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{rm.reorderPoint.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatINR(rm.unitCost)}</TableCell>
                            <TableCell className="text-right font-medium">{formatINR(rm.stockValue)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={RM_STATUS_COLORS[rm.status] ?? "bg-muted text-muted-foreground"}>
                                {rm.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Finished Goods Table */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Finished Goods</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">In Stock</TableHead>
                          <TableHead className="text-right">Reserved</TableHead>
                          <TableHead className="text-right">Std. Cost</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(invReport?.finishedGoods ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No products</TableCell></TableRow>
                        ) : (invReport?.finishedGoods ?? []).map(p => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                            <TableCell className="text-right">{p.currentStock.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-amber-600">{p.reservedStock.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatINR(p.standardCost)}</TableCell>
                            <TableCell className="text-right font-medium">{formatINR(p.price)}</TableCell>
                            <TableCell className="text-right">
                              <span className={p.margin >= 20 ? "text-green-600 font-semibold" : p.margin >= 0 ? "text-amber-600" : "text-red-600"}>
                                {fmtPct(p.margin)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ──────────── SALES TAB ──────────── */}
        <TabsContent value="sales" className="space-y-6">
          {/* Date Filter */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" className="h-8 text-sm w-36" value={salesFrom}
                    onChange={e => setSalesFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" className="h-8 text-sm w-36" value={salesTo}
                    onChange={e => setSalesTo(e.target.value)} />
                </div>
                <Button size="sm" className="h-8" onClick={applyDateFilter}>Apply Filter</Button>
                {(salesFrom || salesTo) && (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => {
                    setSalesFrom(""); setSalesTo(""); setSalesQuery("")
                  }}>Clear</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {loadingSales ? (
            <div className="flex justify-center py-12"><Spinner size={24} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Total Orders"
                  value={salesReport?.totalOrders ?? 0}
                  icon={<ChartBar size={20} />}
                  color="bg-blue-500/10 text-blue-500"
                />
                <StatCard
                  title="Total Revenue"
                  value={formatINR(salesReport?.totalRevenue ?? 0)}
                  icon={<CurrencyInr size={20} />}
                  color="bg-green-500/10 text-green-500"
                />
                <StatCard
                  title="Avg Order Value"
                  value={formatINR(salesReport?.avgOrderValue ?? 0)}
                  icon={<TrendUp size={20} />}
                  color="bg-violet-500/10 text-violet-500"
                />
                <StatCard
                  title="OTD Rate"
                  value={fmtPct(salesReport?.otdRate ?? 0)}
                  sub="On-time delivery"
                  icon={<CheckCircle size={20} />}
                  color="bg-emerald-500/10 text-emerald-500"
                />
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Orders by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusBreakdown
                    data={salesReport?.byStatus ?? {}}
                    colors={SO_STATUS_COLORS}
                    total={salesReport?.totalOrders ?? 0}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users size={16} /> Top Customers by Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Total Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(salesReport?.topCustomers ?? []).length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No data</TableCell></TableRow>
                      ) : (salesReport?.topCustomers ?? []).map((c, i) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">{c.orderCount}</TableCell>
                          <TableCell className="text-right font-semibold">{formatINR(c.totalRevenue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ──────────── PRODUCTION TAB ──────────── */}
        <TabsContent value="production" className="space-y-6">
          {loadingProd ? (
            <div className="flex justify-center py-12"><Spinner size={24} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Active Orders"
                  value={prodReport?.activeOrders ?? 0}
                  icon={<Factory size={20} />}
                  color="bg-blue-500/10 text-blue-500"
                />
                <StatCard
                  title="Completed"
                  value={prodReport?.completedOrders ?? 0}
                  icon={<CheckCircle size={20} />}
                  color="bg-green-500/10 text-green-500"
                />
                <StatCard
                  title="Total Produced"
                  value={fmtNum(prodReport?.totalProduced ?? 0)}
                  icon={<Package size={20} />}
                  color="bg-violet-500/10 text-violet-500"
                />
                <StatCard
                  title="Scrap Rate"
                  value={fmtPct(prodReport?.scrapRate ?? 0)}
                  icon={<Warning size={20} />}
                  color="bg-amber-500/10 text-amber-500"
                />
              </div>

              {prodReport?.avgCycleTime != null && (
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <Clock size={20} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Avg Cycle Time:</span>
                      <span className="font-semibold">{prodReport.avgCycleTime.toFixed(1)} days</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Production by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusBreakdown
                    data={prodReport?.byStatus ?? {}}
                    colors={PROD_STATUS_COLORS}
                    total={(prodReport?.activeOrders ?? 0) + (prodReport?.completedOrders ?? 0)}
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ──────────── FINANCE TAB ──────────── */}
        <TabsContent value="finance" className="space-y-6">
          {loadingFin ? (
            <div className="flex justify-center py-12"><Spinner size={24} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* AR Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowDown size={16} className="text-green-500" /> Accounts Receivable
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { label: "Total Invoiced", value: formatINR(finReport?.totalInvoiced ?? 0), color: "" },
                      { label: "Collected", value: formatINR(finReport?.totalCollected ?? 0), color: "text-green-600" },
                      { label: "Outstanding", value: formatINR(finReport?.outstandingAR ?? 0), color: "text-amber-600" },
                      { label: "Overdue", value: formatINR(finReport?.overdueAR ?? 0), color: "text-red-600" },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={`font-semibold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* AP Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ArrowUp size={16} className="text-red-500" /> Accounts Payable
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {[
                      { label: "Total Outstanding", value: formatINR(finReport?.totalAPOutstanding ?? 0), color: "text-amber-600" },
                      { label: "Overdue", value: formatINR(finReport?.overdueAP ?? 0), color: "text-red-600" },
                    ].map(row => (
                      <div key={row.label} className="flex justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={`font-semibold ${row.color}`}>{row.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Top Unpaid Customers */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users size={16} /> Top Unpaid Customers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(finReport?.topUnpaidCustomers ?? []).length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No outstanding invoices</TableCell></TableRow>
                      ) : (finReport?.topUnpaidCustomers ?? []).map((c, i) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-bold text-muted-foreground w-8">{i + 1}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right font-semibold text-red-600">{formatINR(c.outstanding)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
