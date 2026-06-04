"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChartBar, ShoppingCart, Users, Package, Gear, SignOut, CaretUpDown, Warning, Bell,
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
import { useUser } from "@/hooks/use-user"
import { useNotifications } from "@/components/providers/notification-provider"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-users"
import { clearStoredUser, fetchCredentials, getAuthHeaders, storeUser } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

// Simplified nav — only the 4 core sections
const NAV_ITEMS = [
  { name: "Dashboard", url: "/dashboard", icon: ChartBar, roles: ["Admin", "Sales Executive", "Inventory Manager", "Viewer"] },
  { name: "Orders", url: "/orders", icon: ShoppingCart, roles: ["Admin", "Sales Executive", "Inventory Manager"] },
  { name: "Customers", url: "/customers", icon: Users, roles: ["Admin", "Sales Executive"] },
  { name: "Products", url: "/products", icon: Package, roles: ["Admin", "Inventory Manager"] },
  { name: "Notifications", url: "/notifications", icon: Bell, roles: ["Admin", "Sales Executive", "Inventory Manager", "Viewer"] },
]

const SYSTEM_ITEMS = [
  { name: "Settings", url: "/settings", icon: Gear },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const { state } = useSidebar()

  const { user: currentUser, refresh: refreshUser } = useUser()
  const { unread: notifUnread } = useNotifications()
  const [restockCount, setRestockCount] = useState(0)
  const [switching, setSwitching] = useState(false)

  // Badge: restock count (skip on orders page — that page already loads orders)
  useEffect(() => {
    if (!currentUser || pathname.startsWith("/orders")) return
    async function loadBadge() {
      try {
        const res = await fetch("/api/sales-orders", {
          credentials: fetchCredentials,
          headers: getAuthHeaders(),
        }).then((r) => r.json())
        const orders = Array.isArray(res) ? res : (res?.data ?? [])
        setRestockCount(orders.filter((o: { status: string }) => o.status === "NEEDS_RESTOCK").length)
      } catch { /* silently ignore */ }
    }
    loadBadge()
    const id = setInterval(loadBadge, 60_000)
    return () => clearInterval(id)
  }, [currentUser, pathname])

  async function handleSwitchAccount(email: string) {
    if (currentUser?.email === email) return
    setSwitching(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: fetchCredentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: DEMO_PASSWORD }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? "Could not switch account")
        return
      }
      storeUser(data.user)
      await refreshUser()
      toast.success(`Switched to ${data.user.name}`)
      router.refresh()
    } catch {
      toast.error("Failed to switch account")
    } finally {
      setSwitching(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: fetchCredentials })
    } catch { /* ignore */ }
    clearStoredUser()
    toast.success("Logged out")
    router.push("/login")
  }

  const initials = currentUser
    ? currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const badges: Record<string, number> = {
    "/orders": restockCount,
    "/notifications": notifUnread,
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="flex flex-row items-center gap-3 border-b border-sidebar-border/50 px-3 pb-3 pt-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
        <div className="flex aspect-square size-10 shrink-0 items-center justify-center rounded-full border border-sidebar-border/40 bg-black text-primary-foreground shadow shadow-primary/30 group-data-[collapsible=icon]:size-9">
          <img src="/logo.jpg" className="size-full object-cover rounded-full" alt="ShirtCo" />
        </div>
        <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-heading text-base font-bold">ShirtCo ERP</span>
          <span className="truncate text-xs text-muted-foreground">Shirt Manufacturing</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="group-data-[collapsible=icon]:px-1">
        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wide">
            Main Menu
          </SidebarGroupLabel>
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

        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wide">
            System
          </SidebarGroupLabel>
          <SidebarMenu>
            {SYSTEM_ITEMS.map((item) => (
              <NavItem key={item.url} item={item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 group-data-[collapsible=icon]:p-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={currentUser?.name ?? "Account"}
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:h-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1!"
                >
                  <Avatar className="h-8 w-8 shrink-0 rounded-lg group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9">
                    <AvatarFallback className="rounded-lg bg-linear-to-br from-primary to-violet-600 text-white font-bold text-[11px] shadow shadow-primary/30">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">{currentUser?.name ?? "Guest"}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{currentUser?.role ?? "—"}</span>
                  </div>
                  <CaretUpDown className="ml-auto size-4 shrink-0 group-data-[collapsible=icon]:hidden" />
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
                      <AvatarFallback className="rounded-lg bg-linear-to-br from-primary to-violet-600 text-white font-bold text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{currentUser?.name ?? "Guest"}</span>
                      <span className="truncate text-xs text-muted-foreground">{currentUser?.email ?? ""}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Switch account (one browser = one login)
                </DropdownMenuLabel>
                {DEMO_ACCOUNTS.map((acc) => (
                  <DropdownMenuItem
                    key={acc.email}
                    disabled={switching || currentUser?.email === acc.email}
                    onClick={() => handleSwitchAccount(acc.email)}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{acc.name}</span>
                      <span className="text-xs text-muted-foreground">{acc.role}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
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

const navBtnCollapsed =
  "group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"

function NavItem({
  item, pathname, badge,
}: {
  item: { name: string; url: string; icon: React.ElementType }
  pathname: string
  badge?: number
}) {
  const active = pathname === item.url || pathname.startsWith(item.url + "/")

  return (
    <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <SidebarMenuButton
        asChild
        size="lg"
        tooltip={item.name}
        isActive={active}
        className={cn(
          "h-10 text-sm [&_svg]:size-5",
          navBtnCollapsed
        )}
      >
        <Link
          href={item.url}
          className="flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
        >
          <item.icon
            className="shrink-0"
            weight={active ? "fill" : "regular"}
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">{item.name}</span>
        </Link>
      </SidebarMenuButton>
      {badge != null && badge > 0 && (
        <SidebarMenuBadge className="bg-amber-500 text-white! rounded-full text-[10px] font-bold px-1.5 min-w-5 h-5 flex items-center justify-center group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:text-[9px]">
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  )
}
