"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChartBar, ShoppingCart, Package, Users, SignOut, List, Gear, Warning,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: ChartBar },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
]

const DEV_PROFILES = [
  { id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin" },
  { id: "usr-2", name: "Rahul Verma", email: "rahul@shirtco.in", role: "Sales Executive" },
  { id: "usr-5", name: "Vikram Nair", email: "vikram@shirtco.in", role: "Inventory Manager" },
  { id: "usr-6", name: "Sneha Patel", email: "sneha@shirtco.in", role: "Viewer" },
]

function NavItem({
  href, label, icon: Icon, collapsed, badge,
}: {
  href: string; label: string; icon: React.ElementType; collapsed: boolean; badge?: number
}) {
  const pathname = usePathname()
  const isActive = pathname === href || pathname.startsWith(href + "/")

  return (
    <Link href={href}>
      <span className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2"
      )}>
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-primary" />
        )}
        <Icon
          size={17}
          weight={isActive ? "fill" : "regular"}
          className={cn("shrink-0 transition-transform duration-150", isActive && "scale-110")}
        />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {!collapsed && badge != null && badge > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
        {collapsed && badge != null && badge > 0 && (
          <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-amber-500" />
        )}
      </span>
    </Link>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [restockBadge, setRestockBadge] = useState(0)

  const [currentUser, setCurrentUser] = useState({
    id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin",
  })
  const [showSwitcher, setShowSwitcher] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  // Poll for orders that need restock
  useEffect(() => {
    async function loadBadge() {
      try {
        const res = await fetch("/api/sales-orders").then((r) => r.json())
        const orders = Array.isArray(res) ? res : (res?.data ?? [])
        const count = orders.filter((o: { status: string }) => o.status === "NEEDS_RESTOCK").length
        setRestockBadge(count)
      } catch { /* silently ignore */ }
    }
    loadBadge()
    const id = setInterval(loadBadge, 30000)
    return () => clearInterval(id)
  }, [])

  function handleSwitchProfile(profile: typeof currentUser) {
    localStorage.setItem("current_user", JSON.stringify(profile))
    setCurrentUser(profile)
    setShowSwitcher(false)
    window.location.reload()
  }

  const initials = currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

  const badges: Record<string, number> = {
    "/orders": restockBadge,
  }

  return (
    <aside className={cn(
      "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out shrink-0 relative",
      collapsed ? "w-[56px]" : "w-[220px]"
    )}>
      {/* Brand header */}
      <div className={cn("flex items-center gap-3 border-b border-sidebar-border h-14 px-3 shrink-0")}>
        <button
          onClick={onToggle}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-md border border-sidebar-border/40 transition-transform hover:scale-105"
        >
          <img src="/logo.jpg" className="size-full object-cover rounded-full p-2" alt="ShirtCo Logo" />
        </button>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="font-heading font-bold text-[13px] text-sidebar-foreground truncate">ShirtCo ERP</p>
            <p className="text-[10px] text-sidebar-foreground/40 truncate">Shirt Manufacturing</p>
          </div>
        )}
        {!collapsed && (
          <button onClick={onToggle} className="text-sidebar-foreground/30 hover:text-sidebar-foreground/60 transition-colors">
            <List size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
            collapsed={collapsed}
            badge={badges[href]}
          />
        ))}

        {/* Restock alert banner (expanded mode only) */}
        {!collapsed && restockBadge > 0 && (
          <div className="mt-3 mx-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2 flex items-start gap-2">
            <Warning size={13} className="text-amber-500 mt-0.5 shrink-0" weight="fill" />
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium leading-tight">
              {restockBadge} order{restockBadge > 1 ? "s" : ""} need restocking
            </p>
          </div>
        )}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom actions */}
      <div className="p-2 space-y-0.5">
        <NavItem href="/settings" label="Settings" icon={Gear} collapsed={collapsed} />
      </div>

      {/* Dev Switcher Dropdown */}
      {showSwitcher && !collapsed && (
        <div className="absolute bottom-16 left-3 right-3 z-50 rounded-xl border border-sidebar-border bg-sidebar p-2 shadow-2xl space-y-1 bg-opacity-95 backdrop-blur-md">
          <p className="text-[9px] font-bold uppercase tracking-wider text-sidebar-foreground/30 px-2 py-1">
            Dev Profile Switcher
          </p>
          <div className="max-h-[180px] overflow-y-auto space-y-0.5">
            {DEV_PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSwitchProfile(p)}
                className={cn(
                  "w-full text-left rounded-lg px-2 py-1 text-xs font-medium flex items-center gap-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                  currentUser.id === p.id && "bg-primary/10 text-primary"
                )}
              >
                <div className="size-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                  {p.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] leading-tight">{p.name}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight">{p.role}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* User profile block */}
      {!collapsed && (
        <>
          <Separator className="bg-sidebar-border" />
          <div
            onClick={() => setShowSwitcher(!showSwitcher)}
            className="p-3 flex items-center gap-2.5 cursor-pointer hover:bg-sidebar-accent rounded-lg m-1 transition-colors relative"
          >
            <div className="size-7 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow shadow-primary/30">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate text-sidebar-foreground flex items-center gap-1">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate flex items-center gap-1">
                {currentUser.role} <span className="text-[8px] px-1 rounded bg-primary/10 text-primary font-bold">DEV</span>
              </p>
            </div>
            <button className="text-sidebar-foreground/30 hover:text-sidebar-foreground shrink-0 ml-auto">
              <SignOut size={14} />
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
