"use client"

import Link from "next/link"
import { useFetch } from "@/hooks/use-api"
import { useUser } from "@/hooks/use-user"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Gear,
  User,
  ShieldCheck,
  Clock,
  ArrowDown,
  ArrowUp,
  Spinner,
  ShoppingCart,
  Package,
  Users,
  BellRinging,
  ChartBar,
} from "@phosphor-icons/react"
import type { UserRole, User as UserType, Product, SalesOrder } from "@/lib/types"

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: ["All modules — full access", "User management", "Audit trail & stock log", "Approve credit holds"],
  "Sales Executive": [
    "Create and manage customers",
    "Create and manage sales orders",
    "Check stock and ship orders",
    "Download invoices (shipped orders)",
    "Nudge inventory when restock is needed",
  ],
  "Inventory Manager": [
    "View and update product stock",
    "Fulfill restock on blocked orders",
    "Receive low-stock alerts",
    "Products catalog management",
  ],
}

const ROLE_COLOR: Record<UserRole, string> = {
  Admin: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "Sales Executive": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Inventory Manager": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

interface StockMovement {
  id: number
  entityType: string
  entityId: string
  entityName?: string
  delta: number
  reason?: string
  createdBy: string
  createdAt: string
}

function AccountCard() {
  const { user, loading } = useUser()
  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 flex justify-center text-muted-foreground gap-2">
          <Spinner className="animate-spin" size={18} /> Loading…
        </CardContent>
      </Card>
    )
  }
  if (!user) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <User size={18} className="text-primary" weight="fill" />
          My account
        </CardTitle>
        <CardDescription>Signed-in user for this browser session</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg font-bold text-primary">
          {userInitials(user.name)}
        </div>
        <div className="space-y-1 min-w-0">
          <p className="font-semibold text-lg leading-tight">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mt-1 ${ROLE_COLOR[user.role as UserRole] ?? "bg-muted"}`}>
            {user.role}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function PermissionsCard({ role }: { role: UserRole }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary" weight="fill" />
          Your access
        </CardTitle>
        <CardDescription>What you can do in ShirtCo ERP as {role}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {ROLE_PERMISSIONS[role].map((perm) => (
            <li key={perm} className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              {perm}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function SalesWorkspace() {
  const { data: ordersRes, loading } = useFetch<{ data: SalesOrder[] }>("/api/sales-orders")
  const orders = ordersRes?.data ?? []
  const needsRestock = orders.filter((o) => o.status === "NEEDS_RESTOCK").length
  const readyToShip = orders.filter((o) => o.status === "READY_TO_SHIP").length
  const pending = orders.filter((o) =>
    ["DRAFT", "SUBMITTED", "INVENTORY_CHECK", "APPROVED", "IN_PRODUCTION", "CREDIT_HOLD"].includes(o.status)
  ).length

  return (
    <div className="space-y-6">
      <PermissionsCard role="Sales Executive" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales shortcuts</CardTitle>
          <CardDescription>Jump to your day-to-day tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/orders"><ShoppingCart size={16} /> Orders</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/customers"><Users size={16} /> Customers</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/dashboard"><ChartBar size={16} /> Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order snapshot</CardTitle>
          <CardDescription>Live counts from your pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Spinner className="animate-spin" size={14} /> Loading…
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-2xl font-bold font-mono">{pending}</p>
                <p className="text-xs text-muted-foreground">In progress</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-2xl font-bold font-mono text-amber-600">{needsRestock}</p>
                <p className="text-xs text-muted-foreground">Awaiting restock</p>
              </div>
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 px-4 py-3">
                <p className="text-2xl font-bold font-mono text-teal-600">{readyToShip}</p>
                <p className="text-xs text-muted-foreground">Ready to ship</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRinging size={18} /> Notifications
          </CardTitle>
          <CardDescription>
            Use the bell in the top bar for restock updates. Nudge inventory from an order that needs restock.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function InventoryWorkspace() {
  const { data: productsRes, loading } = useFetch<Product[] | { data: Product[] }>("/api/products")
  const products = Array.isArray(productsRes) ? productsRes : (productsRes?.data ?? [])
  const low = products.filter((p) => p.currentStock > 0 && p.currentStock < 10).length
  const out = products.filter((p) => p.currentStock === 0).length
  const healthy = products.filter((p) => p.currentStock >= 10).length

  return (
    <div className="space-y-6">
      <PermissionsCard role="Inventory Manager" />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventory shortcuts</CardTitle>
          <CardDescription>Stock and fulfillment tasks</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/products"><Package size={16} /> Products & stock</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/orders"><ShoppingCart size={16} /> Orders (restock)</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/dashboard"><ChartBar size={16} /> Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stock snapshot</CardTitle>
          <CardDescription>Current product inventory health</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Spinner className="animate-spin" size={14} /> Loading…
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <p className="text-2xl font-bold font-mono text-emerald-600">{healthy}</p>
                <p className="text-xs text-muted-foreground">Healthy (≥10 units)</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-2xl font-bold font-mono text-amber-600">{low}</p>
                <p className="text-xs text-muted-foreground">Low stock</p>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <p className="text-2xl font-bold font-mono text-destructive">{out}</p>
                <p className="text-xs text-muted-foreground">Out of stock</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AdminUsersPanel() {
  const { data: users, loading } = useFetch<UserType[]>("/api/users")
  const allUsers = users ?? []
  const roleGroups = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => ({
    role,
    users: allUsers.filter((u) => u.role === role),
  }))

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2">
          <User size={16} weight="fill" className="text-primary" />
          <h2 className="font-heading font-semibold">Users ({allUsers.length})</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Spinner className="animate-spin" size={16} /> Loading users…
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="font-semibold text-xs">Name</TableHead>
                <TableHead className="font-semibold text-xs">Email</TableHead>
                <TableHead className="font-semibold text-xs">Role</TableHead>
                <TableHead className="font-semibold text-xs">Status</TableHead>
                <TableHead className="font-semibold text-xs">Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/20">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                        {userInitials(u.name)}
                      </div>
                      <span className="font-medium text-sm">{u.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>
                      {u.role}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        u.status === "Active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {u.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.lastLogin ? formatDate(u.lastLogin) : "Never"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={16} weight="fill" className="text-primary" />
          <h2 className="font-heading font-semibold">Role permissions</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roleGroups.map(({ role, users: roleUsers }) => (
            <div key={role} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_COLOR[role]}`}>
                  {role}
                </span>
                <span className="text-xs text-muted-foreground">
                  {roleUsers.length} user{roleUsers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ul className="space-y-1">
                {ROLE_PERMISSIONS[role].map((perm) => (
                  <li key={perm} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary/40 shrink-0" />
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminAuditPanel() {
  const { data: movements, loading } = useFetch<StockMovement[]>("/api/stock-movements")
  const allMovements = movements ?? []

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2">
        <Clock size={16} weight="fill" className="text-primary" />
        <h2 className="font-heading font-semibold">Audit trail — stock movements</h2>
      </div>
      <p className="px-5 py-2 text-xs text-muted-foreground border-b bg-muted/10">
        Admin only. Full log of inventory adjustments across the system.
      </p>
      {loading ? (
        <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Spinner className="animate-spin" size={16} /> Loading…
        </div>
      ) : allMovements.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">No stock movements logged yet.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-xs">Time</TableHead>
              <TableHead className="font-semibold text-xs">Item</TableHead>
              <TableHead className="font-semibold text-xs">Type</TableHead>
              <TableHead className="font-semibold text-xs">Change</TableHead>
              <TableHead className="font-semibold text-xs">Reason</TableHead>
              <TableHead className="font-semibold text-xs">By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allMovements.map((m) => {
              const isAdd = m.delta > 0
              return (
                <TableRow key={m.id} className="hover:bg-muted/20">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-sm">{m.entityName ?? "Unknown"}</span>
                    <span className="text-[10px] text-muted-foreground block font-mono">{m.entityId}</span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        m.entityType === "raw_material"
                          ? "bg-blue-500/10 text-blue-400"
                          : "bg-emerald-500/10 text-emerald-400"
                      }`}
                    >
                      {m.entityType === "raw_material" ? "Raw material" : "Product"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 text-sm font-bold ${
                        isAdd ? "text-emerald-500" : "text-destructive"
                      }`}
                    >
                      {isAdd ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                      {isAdd ? "+" : ""}
                      {m.delta.toLocaleString("en-IN")}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.reason ?? "Adjustment"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.createdBy}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user, loading, isAdmin, isSales, isInventory } = useUser()

  if (loading) {
    return (
      <div className="p-10 flex justify-center text-muted-foreground gap-2">
        <Spinner className="animate-spin" size={20} /> Loading settings…
      </div>
    )
  }

  const subtitle = isAdmin
    ? "Manage users, roles, and system audit logs"
    : isSales
      ? "Your sales profile and workspace"
      : isInventory
        ? "Your inventory profile and workspace"
        : "Account settings"

  return (
    <div className="p-6 space-y-6 px-10 w-full mx-auto">
      <title>Settings | ShirtCo ERP</title>
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Gear size={22} weight="fill" className="text-primary" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="account">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="account">My account</TabsTrigger>
            <TabsTrigger value="users">Users & access</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="mt-4">
            <AccountCard />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <AdminUsersPanel />
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <AdminAuditPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="account">
          <TabsList>
            <TabsTrigger value="account">My account</TabsTrigger>
            <TabsTrigger value="workspace">
              {isSales ? "Sales workspace" : "Inventory workspace"}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="mt-4">
            <AccountCard />
          </TabsContent>
          <TabsContent value="workspace" className="mt-4">
            {isSales && <SalesWorkspace />}
            {isInventory && <InventoryWorkspace />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
