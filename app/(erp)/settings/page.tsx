"use client"

import { useState } from "react"
import { useFetch } from "@/hooks/use-api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Gear, User, ShieldCheck, Clock, ArrowDown, ArrowUp, Spinner } from "@phosphor-icons/react"
import type { UserRole, User as UserType } from "@/lib/types"

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: ["All Modules — Full CRUD", "User Management", "Role Management", "Audit Log Access"],
  "Sales Executive": ["Create/Manage Customers", "Create/Manage Sales Orders", "Track Shipments", "Inventory — Read Only"],
  "Inventory Manager": ["Raw Material Management", "Stock Adjustments", "Goods Receipt", "Warehouse Management"],
}

const ROLE_COLOR: Record<UserRole, string> = {
  Admin: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "Sales Executive": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Inventory Manager": "bg-emerald-500/10 text-emerald-600",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function SettingsPage() {
  const { data: users, loading: loadingUsers } = useFetch<UserType[]>("/api/users")
  const { data: movements, loading: loadingMovements } = useFetch<any[]>("/api/stock-movements")

  const allUsers = users ?? []
  const allMovements = movements ?? []

  const roleGroups = (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => ({
    role,
    users: allUsers.filter((u) => u.role === role),
  }))

  return (
    <div className="p-6 space-y-6 px-10 w-full mx-auto">
      <title>Settings | ShirtCo ERP</title>
      <div>
        <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
          <Gear size={22} weight="fill" className="text-primary" /> Settings & Audit Log
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage user access control and view stock movements</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users & Permissions</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail (Stock Movements)</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4 space-y-6">
          {/* Users table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2">
              <User size={16} weight="fill" className="text-primary" />
              <h2 className="font-heading font-semibold">Users ({allUsers.length})</h2>
            </div>
            {loadingUsers ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Spinner className="animate-spin" size={16} /> Loading users...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="font-semibold text-xs">Name</TableHead>
                    <TableHead className="font-semibold text-xs">Email</TableHead>
                    <TableHead className="font-semibold text-xs">Role</TableHead>
                    <TableHead className="font-semibold text-xs">Status</TableHead>
                    <TableHead className="font-semibold text-xs">Last Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/20 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
                            {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </div>
                          <span className="font-medium text-[13px]">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLOR[u.role]}`}>
                          {u.role}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.status === "Active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                          {u.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.lastLogin ? formatDate(u.lastLogin) : "Never"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <Separator />

          {/* Role permissions */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck size={16} weight="fill" className="text-primary" />
              <h2 className="font-heading font-semibold">Role Permissions</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roleGroups.map(({ role, users: roleUsers }) => (
                <div key={role} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${ROLE_COLOR[role]}`}>
                      {role}
                    </span>
                    <span className="text-xs text-muted-foreground">{roleUsers.length} user{roleUsers.length !== 1 ? "s" : ""}</span>
                  </div>
                  <ul className="space-y-1">
                    {ROLE_PERMISSIONS[role].map((perm) => (
                      <li key={perm} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full bg-primary/40 shrink-0" />
                        {perm}
                      </li>
                    ))}
                  </ul>
                  {roleUsers.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-1">
                      {roleUsers.map((u) => (
                        <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {u.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-muted/20 flex items-center gap-2">
              <Clock size={16} weight="fill" className="text-primary" />
              <h2 className="font-heading font-semibold">Stock Movements Log</h2>
            </div>
            {loadingMovements ? (
              <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Spinner className="animate-spin" size={16} /> Loading movements log...
              </div>
            ) : allMovements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No stock movements logged yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="font-semibold text-xs">Timestamp</TableHead>
                    <TableHead className="font-semibold text-xs">Item</TableHead>
                    <TableHead className="font-semibold text-xs">Type</TableHead>
                    <TableHead className="font-semibold text-xs">Change</TableHead>
                    <TableHead className="font-semibold text-xs">Reason</TableHead>
                    <TableHead className="font-semibold text-xs">Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allMovements.map((m) => {
                    const isAdd = m.delta > 0
                    return (
                      <TableRow key={m.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(m.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium text-[13px]">{m.entityName ?? "Unknown Item"}</span>
                            <span className="text-[10px] text-muted-foreground block font-mono">{m.entityId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${m.entityType === "raw_material" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                            {m.entityType === "raw_material" ? "Raw Material" : "Finished Product"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-[13px] font-bold ${isAdd ? "text-emerald-500" : "text-destructive"}`}>
                            {isAdd ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                            {isAdd ? "+" : ""}{m.delta.toLocaleString("en-IN")}
                          </span>
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{m.reason ?? "Manual Adjustment"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.createdBy}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
