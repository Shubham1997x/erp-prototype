"use client"

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

function pageTitle(pathname: string): string {
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

function ERPHeader() {
  const { user, loading } = useUser()
  const pathname = usePathname()
  const initials = userInitials(user?.name)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-14">
      <div className="flex flex-1 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <h1 className="truncate font-heading text-sm font-bold">{pageTitle(pathname)}</h1>
      </div>

      <div className="flex items-center gap-2 px-4">
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

export function ERPShell({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <NotificationProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <ERPHeader />
            <main className="flex-1 overflow-auto bg-muted/20">
              <AuthGuard>{children}</AuthGuard>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </NotificationProvider>
    </UserProvider>
  )
}
