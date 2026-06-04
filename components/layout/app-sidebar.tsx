"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChartBar, ShoppingCart, Users, Package, Gear, SignOut, CaretUpDown, Warning,
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
import { toast } from "sonner"

// Simplified nav — only the 4 core sections
const NAV_ITEMS = [
  { name: "Dashboard", url: "/dashboard", icon: ChartBar, roles: ["Admin", "Sales Executive", "Inventory Manager", "Viewer"] },
  { name: "Orders",    url: "/orders",    icon: ShoppingCart, roles: ["Admin", "Sales Executive", "Inventory Manager"] },
  { name: "Customers", url: "/customers", icon: Users, roles: ["Admin", "Sales Executive"] },
  { name: "Products",  url: "/products",  icon: Package, roles: ["Admin", "Inventory Manager"] },
]

const SYSTEM_ITEMS = [
  { name: "Settings", url: "/settings", icon: Gear },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router   = useRouter()
  const { state } = useSidebar()

  const [restockCount, setRestockCount] = useState(0)
  const [currentUser, setCurrentUser] = useState<{
    id: string; name: string; email: string; role: string
  } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  // Badge: count of orders needing restock
  useEffect(() => {
    async function loadBadge() {
      try {
        const userId = currentUser?.id ?? "usr-1"
        const userRole = currentUser?.role ?? "Admin"
        const res = await fetch("/api/sales-orders", {
          headers: { "X-User-Id": userId, "X-User-Role": userRole },
        }).then((r) => r.json())
        const orders = Array.isArray(res) ? res : (res?.data ?? [])
        setRestockCount(orders.filter((o: { status: string }) => o.status === "NEEDS_RESTOCK").length)
      } catch { /* silently ignore */ }
    }
    loadBadge()
    const id = setInterval(loadBadge, 30_000)
    return () => clearInterval(id)
  }, [currentUser])

  async function handleLogout() {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    localStorage.removeItem("current_user")
    toast.success("Logged out")
    router.push("/login")
  }

  const initials = currentUser
    ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const badges: Record<string, number> = {
    "/orders": restockCount,
  }

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
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarMenu>
            {NAV_ITEMS.filter(i => !currentUser || i.roles.includes(currentUser.role)).map((item) => (
              <NavItem
                key={item.url}
                item={item}
                pathname={pathname}
                badge={badges[item.url]}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* Restock alert in expanded mode */}
        {restockCount > 0 && (!currentUser || currentUser.role === "Admin" || currentUser.role === "Inventory Manager") && (
          <div className="mx-2 mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex items-start gap-2 group-data-[collapsible=icon]:hidden">
            <Warning size={13} className="text-amber-500 mt-0.5 shrink-0" weight="fill" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium leading-tight">
              {restockCount} order{restockCount > 1 ? "s" : ""} need restocking
            </p>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarMenu>
            {SYSTEM_ITEMS.map((item) => (
              <NavItem key={item.url} item={item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
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
  item, pathname, badge,
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
        <SidebarMenuBadge className="bg-amber-500 !text-white rounded-full text-[10px] font-bold px-1.5 min-w-5 h-5 flex items-center justify-center">
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
