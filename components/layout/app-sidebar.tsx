"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChartBar, ShoppingCart, Users, Buildings, Package, TreeStructure,
  Factory, Wrench, Truck, Gear, SignOut, CaretUpDown, CurrencyDollar,
  ChartLine, Bell, Warehouse, ClipboardText, ArrowsLeftRight,
} from "@phosphor-icons/react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuBadge, useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type UserRole = "Admin" | "Sales Executive" | "Production Manager" | "Inventory Manager" | "Finance Manager" | "Viewer"

const ROLE_NAV: Record<string, string[]> = {
  Admin:              ["/dashboard","/sales-orders","/customers","/suppliers","/inventory","/bom","/production","/mes","/shipments","/purchase-orders","/finance","/quality","/warehouses","/reports","/notifications","/settings"],
  "Sales Executive":  ["/dashboard","/sales-orders","/customers","/inventory","/shipments","/notifications","/settings"],
  "Production Manager":["/dashboard","/inventory","/bom","/production","/mes","/quality","/notifications","/settings"],
  "Inventory Manager":["/dashboard","/suppliers","/inventory","/shipments","/purchase-orders","/warehouses","/notifications","/settings"],
  "Finance Manager":  ["/dashboard","/sales-orders","/customers","/finance","/reports","/notifications","/settings"],
  Viewer:             ["/dashboard"],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router   = useRouter()
  const { state } = useSidebar()
  const [badges, setBadges] = useState<Record<string, number>>({})
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: UserRole } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    async function loadBadges() {
      try {
        const [sos, rms, pos, notifs] = await Promise.all([
          fetch("/api/sales-orders",     { headers: { "X-User-Id": currentUser!.id, "X-User-Role": currentUser!.role } }).then(r => r.json()),
          fetch("/api/raw-materials",    { headers: { "X-User-Id": currentUser!.id, "X-User-Role": currentUser!.role } }).then(r => r.json()),
          fetch("/api/production-orders",{ headers: { "X-User-Id": currentUser!.id, "X-User-Role": currentUser!.role } }).then(r => r.json()),
          fetch("/api/notifications",    { headers: { "X-User-Id": currentUser!.id, "X-User-Role": currentUser!.role } }).then(r => r.json()),
        ])
        setBadges({
          "/sales-orders":  Array.isArray(sos)  ? sos.filter((s:  { status: string }) => ["SUBMITTED","INVENTORY_CHECK","APPROVED"].includes(s.status)).length : 0,
          "/inventory":     Array.isArray(rms)  ? rms.filter((rm: { currentStock: number; reorderPoint: number }) => rm.currentStock <= rm.reorderPoint).length  : 0,
          "/production":    Array.isArray(pos)  ? pos.filter((p:  { status: string }) => ["PLANNED","RELEASED","MATERIAL_RESERVED","IN_PROGRESS","QUALITY_CHECK"].includes(p.status)).length : 0,
          "/notifications": Array.isArray(notifs) ? notifs.filter((n: { isRead: boolean }) => !n.isRead).length : 0,
        })
      } catch { /* silently ignore */ }
    }
    loadBadges()
    const id = setInterval(loadBadges, 30_000)
    return () => clearInterval(id)
  }, [currentUser])

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch { /* ignore */ }
    localStorage.removeItem("current_user")
    toast.success("Logged out")
    router.push("/login")
  }

  const role = (currentUser?.role ?? "Viewer") as UserRole
  const allowed = ROLE_NAV[role] ?? ["/dashboard"]
  const initials = currentUser
    ? currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const overviewItems = [
    { name: "Dashboard",      url: "/dashboard",       icon: ChartBar },
    { name: "Sales Orders",   url: "/sales-orders",    icon: ShoppingCart },
    { name: "Customers",      url: "/customers",       icon: Users },
    { name: "Suppliers",      url: "/suppliers",       icon: Buildings },
  ].filter(i => allowed.includes(i.url))

  const opsItems = [
    { name: "Inventory",      url: "/inventory",       icon: Package },
    { name: "Bill of Materials",url: "/bom",           icon: TreeStructure },
    { name: "Production",     url: "/production",      icon: Factory },
    { name: "MES",            url: "/mes",             icon: Wrench },
    { name: "Shipments",      url: "/shipments",       icon: Truck },
    { name: "Purchase Orders",url: "/purchase-orders", icon: ClipboardText },
    { name: "Warehouses",     url: "/warehouses",      icon: Warehouse },
    { name: "Quality",        url: "/quality",         icon: ArrowsLeftRight },
  ].filter(i => allowed.includes(i.url))

  const financeItems = [
    { name: "Finance",        url: "/finance",         icon: CurrencyDollar },
    { name: "Reports",        url: "/reports",         icon: ChartLine },
  ].filter(i => allowed.includes(i.url))

  const systemItems = [
    { name: "Notifications",  url: "/notifications",   icon: Bell },
    { name: "Settings",       url: "/settings",        icon: Gear },
  ].filter(i => allowed.includes(i.url))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pt-3 pb-2 px-4 flex flex-row items-center gap-2">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow shadow-primary/30 shrink-0 border border-sidebar-border/40">
          <img src="/logo.svg" className="size-full object-contain" alt="ShirtCo" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-heading font-bold text-[13px]">ShirtCo ERP</span>
          <span className="truncate text-[10px] text-muted-foreground">Shirt Manufacturing</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {overviewItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Overview</SidebarGroupLabel>
            <SidebarMenu>
              {overviewItems.map(item => (
                <NavItem key={item.url} item={item} pathname={pathname} badge={badges[item.url]} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {opsItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarMenu>
              {opsItems.map(item => (
                <NavItem key={item.url} item={item} pathname={pathname} badge={badges[item.url]} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {financeItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Finance</SidebarGroupLabel>
            <SidebarMenu>
              {financeItems.map(item => (
                <NavItem key={item.url} item={item} pathname={pathname} badge={badges[item.url]} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        {systemItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarMenu>
              {systemItems.map(item => (
                <NavItem key={item.url} item={item} pathname={pathname} badge={badges[item.url]} />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white font-bold text-[11px] shadow shadow-primary/30">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{currentUser?.name ?? "Guest"}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{currentUser?.role ?? "—"}</span>
                  </div>
                  <CaretUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={state === "collapsed" ? "right" : "top"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary to-violet-600 text-white font-bold text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{currentUser?.name ?? "Guest"}</span>
                      <span className="truncate text-xs text-muted-foreground">{currentUser?.email ?? ""}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer flex items-center gap-2">
                    <Gear size={16} /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive flex items-center gap-2"
                >
                  <SignOut size={16} /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function NavItem({
  item,
  pathname,
  badge,
}: {
  item: { name: string; url: string; icon: React.ElementType }
  pathname: string
  badge?: number
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")}>
        <Link href={item.url}>
          <item.icon />
          <span>{item.name}</span>
        </Link>
      </SidebarMenuButton>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge className="bg-primary !text-primary-foreground rounded-full text-[10px] font-bold px-1.5 min-w-5 h-5 flex items-center justify-center">
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
