"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { AuthGuard } from "@/components/layout/auth-guard"
import { UserProvider, useUser } from "@/components/providers/user-provider"
import { NotificationProvider } from "@/components/providers/notification-provider"
import { getAvatarUrl } from "@/lib/avatar-utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Eye, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function pageTitle(pathname: string): string {
  if (pathname === "/orders/new") return "New Sales Order"
  const segment = pathname.split("/").filter(Boolean).pop() ?? "dashboard"
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function userInitials(name: string | undefined): string {
  if (!name?.trim()) return "?"
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

const COLOR_MODES = [
  {
    value: "none",
    label: "Standard Vision",
    description: "Default colors",
    swatches: ["#ef4444", "#22c55e", "#3b82f6"],
  },
  {
    value: "deuteranopia",
    label: "Deuteranopia",
    description: "Green-blind",
    swatches: ["#c0a040", "#808080", "#3b82f6"],
  },
  {
    value: "protanopia",
    label: "Protanopia",
    description: "Red-blind",
    swatches: ["#888800", "#888888", "#3b82f6"],
  },
  {
    value: "tritanopia",
    label: "Tritanopia",
    description: "Blue-blind",
    swatches: ["#ef4444", "#22c55e", "#808080"],
  },
] as const

function ColorBlindPicker({ mode, onChange }: { mode: string; onChange: (v: string) => void }) {
  const active = COLOR_MODES.find((m) => m.value === mode) ?? COLOR_MODES[0]
  const isFiltered = mode !== "none"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title="Color accessibility mode"
          className={cn(
            "h-8 gap-1.5 px-2 text-[11px] font-semibold",
            isFiltered
              ? "text-primary bg-primary/10 hover:bg-primary/15"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          {isFiltered && <span className="hidden sm:inline">{active.label}</span>}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal pb-1">
          Color Vision Mode
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {COLOR_MODES.map((m) => (
          <DropdownMenuItem
            key={m.value}
            onClick={() => onChange(m.value)}
            className="flex items-center gap-2.5 py-2 cursor-pointer"
          >
            <div className="flex gap-0.5 shrink-0">
              {m.swatches.map((c, i) => (
                <span
                  key={i}
                  className="inline-block h-3 w-3 rounded-full border border-black/10"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-none">{m.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{m.description}</p>
            </div>
            {mode === m.value && <Check className="h-3 w-3 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ERPHeader() {
  const { user, loading } = useUser()
  const pathname = usePathname()
  const initials = userInitials(user?.name)

  const [colorBlindMode, setColorBlindMode] = useState<string>("none")

  useEffect(() => {
    const stored = localStorage.getItem("colorblind-mode")
    if (stored && stored !== "none") setColorBlindMode(stored)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("colorblind-mode", colorBlindMode)
      // Dispatch so ERPShell wrapper div picks up the new filter
      window.dispatchEvent(new CustomEvent("colorblind-change", { detail: colorBlindMode }))
    }
  }, [colorBlindMode])

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
      <div className="flex flex-1 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <h1 className="truncate font-heading text-sm font-bold">{pageTitle(pathname)}</h1>
      </div>

      <div className="flex items-center gap-3 px-4">
        <ColorBlindPicker mode={colorBlindMode} onChange={setColorBlindMode} />

        <NotificationBell />

        <div
          className="flex items-center gap-2 pl-1"
          title={user ? `${user.name} · ${user.role}` : undefined}
        >
          <Avatar className="h-8 w-8 rounded-full border">
            {user && (
              <AvatarImage src={getAvatarUrl(user.id)} className="object-cover" />
            )}
            <AvatarFallback className="rounded-full bg-primary/10 text-xs font-bold text-primary">
              {loading ? "…" : initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-xs font-semibold leading-tight">
              {loading ? "Loading…" : (user?.name ?? "Guest")}
            </p>
            {!loading && user?.role && (
              <p className="truncate text-[10px] text-muted-foreground leading-tight">{user.role}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function FilteredShell({ children }: { children: React.ReactNode }) {
  const [filterMode, setFilterMode] = useState<string>("none")

  useEffect(() => {
    const stored = localStorage.getItem("colorblind-mode")
    if (stored && stored !== "none") setFilterMode(stored)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => setFilterMode((e as CustomEvent).detail)
    window.addEventListener("colorblind-change", handler)
    return () => window.removeEventListener("colorblind-change", handler)
  }, [])

  const filterStyle =
    filterMode !== "none" ? { filter: `url(#colorblind-${filterMode})` } : undefined

  return (
    <div style={filterStyle} className="flex h-svh w-full overflow-hidden">
      {children}
    </div>
  )
}

export function ERPShell({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <NotificationProvider>
        <FilteredShell>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <ERPHeader />
              <main className="flex-1 overflow-auto bg-muted/20">
                <AuthGuard>{children}</AuthGuard>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </FilteredShell>
      </NotificationProvider>
    </UserProvider>
  )
}
