"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChartBar, ShoppingCart, Package, TreeStructure, Factory,
  Gear, Truck, Wrench, Users, SignOut, Moon, Sun, List, Buildings,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: ChartBar, group: "main" },
  { href: "/sales-orders", label: "Sales Orders", icon: ShoppingCart, group: "main" },
  { href: "/customers", label: "Customers", icon: Users, group: "main" },
  { href: "/suppliers", label: "Suppliers", icon: Buildings, group: "main" },
  { href: "/inventory", label: "Inventory", icon: Package, group: "ops" },
  { href: "/bom", label: "Bill of Materials", icon: TreeStructure, group: "ops" },
  { href: "/production", label: "Production", icon: Factory, group: "ops" },
  { href: "/mes", label: "MES", icon: Wrench, group: "ops" },
  { href: "/shipments", label: "Shipments", icon: Truck, group: "ops" },
]

const DEV_PROFILES = [
  { id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin" },
  { id: "usr-2", name: "Rahul Verma", email: "rahul@shirtco.in", role: "Sales Executive" },
  { id: "usr-4", name: "Priya Sharma", email: "priya@shirtco.in", role: "Production Manager" },
  { id: "usr-5", name: "Vikram Nair", email: "vikram@shirtco.in", role: "Inventory Manager" },
  { id: "usr-6", name: "Sneha Patel", email: "sneha@shirtco.in", role: "Viewer" },
]

const ROLE_NAV_ACCESS: Record<string, string[]> = {
  Admin: ["/dashboard", "/sales-orders", "/customers", "/suppliers", "/inventory", "/bom", "/production", "/mes", "/shipments"],
  "Sales Executive": ["/dashboard", "/sales-orders", "/customers", "/inventory", "/shipments"],
  "Production Manager": ["/dashboard", "/inventory", "/bom", "/production", "/mes"],
  "Inventory Manager": ["/dashboard", "/suppliers", "/inventory", "/shipments"],
  Viewer: ["/dashboard"],
}

function NavItem({ href, label, icon: Icon, collapsed, badge }: {
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
          <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
        {collapsed && badge != null && badge > 0 && (
          <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary" />
        )}
      </span>
    </Link>
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [badges, setBadges] = useState<Record<string, number>>({})

  // Dev Switcher States
  const [currentUser, setCurrentUser] = useState({ id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin" })
  const [showSwitcher, setShowSwitcher] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try {
        setCurrentUser(JSON.parse(stored))
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    async function loadBadges() {
      try {
        const [sos, rms, pos] = await Promise.all([
          fetch("/api/sales-orders").then((r) => r.json()),
          fetch("/api/raw-materials").then((r) => r.json()),
          fetch("/api/production-orders").then((r) => r.json()),
        ])
        setBadges({
          "/sales-orders": sos.filter((s: { status: string }) => ["SUBMITTED", "INVENTORY_CHECK", "APPROVED"].includes(s.status)).length,
          "/inventory": rms.filter((rm: { currentStock: number; reorderPoint: number }) => rm.currentStock <= rm.reorderPoint).length,
          "/production": pos.filter((po: { status: string }) => ["PLANNED", "RELEASED", "MATERIAL_RESERVED", "IN_PROGRESS", "QUALITY_CHECK"].includes(po.status)).length,
        })
      } catch { /* silently ignore */ }
    }
    loadBadges()
    const id = setInterval(loadBadges, 30000)
    return () => clearInterval(id)
  }, [])

  function handleSwitchProfile(profile: typeof currentUser) {
    localStorage.setItem("current_user", JSON.stringify(profile))
    setCurrentUser(profile)
    setShowSwitcher(false)
    window.location.reload()
  }

  const allowedHrefs = ROLE_NAV_ACCESS[currentUser.role] || ["/dashboard"]
  const mainItems = navItems.filter((n) => n.group === "main" && allowedHrefs.includes(n.href))
  const opsItems = navItems.filter((n) => n.group === "ops" && allowedHrefs.includes(n.href))
  const initials = currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)

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
          <img src="/logo.svg" className="size-full object-contain " alt="ShirtCo Logo" />
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
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/25 px-2.5 mb-1.5">
            Overview
          </p>
        )}
        {mainItems.map(({ href, label, icon }) => (
          <NavItem key={href} href={href} label={label} icon={icon} collapsed={collapsed} badge={badges[href]} />
        ))}

        <div className="my-2">
          {!collapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/25 px-2.5 mb-1.5 mt-3">
              Operations
            </p>
          )}
          {collapsed && <Separator className="bg-sidebar-border my-2" />}
        </div>

        {opsItems.map(({ href, label, icon }) => (
          <NavItem key={href} href={href} label={label} icon={icon} collapsed={collapsed} badge={badges[href]} />
        ))}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom actions */}
      <div className="p-2 space-y-0.5">
        <NavItem href="/settings" label="Settings" icon={Gear} collapsed={collapsed} />
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
            collapsed && "justify-center px-2"
          )}
        >
          {resolvedTheme === "dark"
            ? <Sun size={17} className="shrink-0" />
            : <Moon size={17} className="shrink-0" />}
          {!collapsed && <span>{resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>
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
