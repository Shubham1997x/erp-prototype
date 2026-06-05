"use client"

import { useMemo } from "react"
import { Check, Bell, ArrowRight, Package, Warning, Info, CheckCircle } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useNotifications, type AppNotification } from "@/components/providers/notification-provider"
import {
  formatNotificationTime,
  notificationSummary,
  notificationTypeMeta,
} from "@/lib/notification-display"

// ─── Grouping helpers ────────────────────────────────────────────────────────

const GROUP_ORDER = [
  "SO_NEEDS_RESTOCK",
  "SO_RESTOCK_COMPLETE",
  "SO_NUDGE_RESTOCK",
  "LOW_STOCK",
  "__other__",
] as const

function groupKey(type?: string): string {
  if (!type) return "__other__"
  if (["SO_NEEDS_RESTOCK", "SO_RESTOCK_COMPLETE", "SO_NUDGE_RESTOCK", "LOW_STOCK"].includes(type))
    return type
  return "__other__"
}

const GROUP_LABELS: Record<string, string> = {
  SO_NEEDS_RESTOCK: "Restock Needed",
  SO_RESTOCK_COMPLETE: "Ready to Ship",
  SO_NUDGE_RESTOCK: "Restock Reminders",
  LOW_STOCK: "Low Stock Alerts",
  __other__: "General",
}

export interface GroupedNotification extends AppNotification {
  count: number
  ids: string[]
}

function deduplicate(items: AppNotification[]): GroupedNotification[] {
  const map = new Map<string, GroupedNotification>()
  for (const n of items) {
    const key = `${n.type}-${n.entityId}-${n.title}`
    if (map.has(key)) {
      const existing = map.get(key)!
      existing.count += 1
      existing.ids.push(n.id)
      // Keep the most recent timestamp
      if (new Date(n.createdAt) > new Date(existing.createdAt)) {
        existing.createdAt = n.createdAt
      }
    } else {
      map.set(key, { ...n, count: 1, ids: [n.id] })
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function useGrouped(items: AppNotification[]) {
  return useMemo(() => {
    const map = new Map<string, AppNotification[]>()
    for (const n of items) {
      const k = groupKey(n.type)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    // Order groups
    const ordered: { key: string; label: string; items: GroupedNotification[] }[] = []
    for (const k of GROUP_ORDER) {
      if (map.has(k)) ordered.push({ key: k, label: GROUP_LABELS[k], items: deduplicate(map.get(k)!) })
    }
    // Any remaining keys not in GROUP_ORDER
    for (const [k, its] of map.entries()) {
      if (!ordered.find((g) => g.key === k)) {
        ordered.push({ key: k, label: GROUP_LABELS[k] ?? k, items: deduplicate(its) })
      }
    }
    return ordered
  }, [items])
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { items, unread, loading, markAllRead, markRead } = useNotifications()
  const groups = useGrouped(items)

  const unreadItems = items.filter((n) => !n.isRead)
  const readItems = items.filter((n) => n.isRead)

  return (
    <div className="p-4 sm:p-6 space-y-5 lg:px-10 w-full mx-auto max-w-7xl">
      <title>Notifications | ShirtCo ERP</title>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unreadItems.length > 0 ? `${unreadItems.length} unread` : "All caught up"}
          </p>
        </div>
        {unreadItems.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => void markAllRead()}
          >
            <Check size={14} />
            Mark all as read
          </Button>
        )}
      </div>

      {/* Loading */}
      {loading && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24">
          <Bell size={32} className="animate-pulse text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Loading notifications…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
            <Check size={28} className="text-emerald-500" weight="bold" />
          </div>
          <p className="text-base font-semibold">You&apos;re all caught up!</p>
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      )}

      <div className=" gap-6 w-full">
        {/* Unread section */}
        {unreadItems.length > 0 && (
          <section className="break-inside-avoid mb-6">
            <SectionHeading label="Unread" count={unreadItems.length} accent />
            <div className="mt-2 divide-y rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden glass-card">
              {deduplicate(unreadItems).map((n) => (
                <NotifRow key={n.ids.join(',')} n={n} onMarkRead={() => { n.ids.forEach(id => void markRead(id)) }} />
              ))}
            </div>
          </section>
        )}

        {/* Read — grouped by type */}
        {groups
          .map((g) => ({ ...g, items: g.items.filter((n) => n.isRead) }))
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key} className="break-inside-avoid mb-6">
              <GroupLabel label={g.label} type={g.key} />
              <div className="mt-1.5 divide-y rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden glass-card">
                {g.items.map((n) => (
                  <NotifRow key={n.ids.join(',')} n={n} muted />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({
  label,
  count,
  accent,
}: {
  label: string
  count: number
  accent?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <h2
        className={cn(
          "text-xs font-bold uppercase tracking-wider",
          accent ? "text-primary" : "text-muted-foreground"
        )}
      >
        {label}
      </h2>
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[10px] font-bold",
          accent
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </div>
  )
}

function GroupLabel({ label, type }: { label: string; type: string }) {
  const meta = notificationTypeMeta(type === "__other__" ? undefined : type)
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={cn("size-2 rounded-full", meta.accent)} />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function NotifRow({
  n,
  muted,
  onMarkRead,
}: {
  n: GroupedNotification
  muted?: boolean
  onMarkRead?: () => void
}) {
  const meta = notificationTypeMeta(n.type)
  const summary = notificationSummary(n.title, n.message, n.entityId)
  const href =
    n.entityType === "sales_order" && n.entityId ? `/orders/${n.entityId}` : undefined

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors",
        !n.isRead && "bg-primary/[0.035]",
        muted && "opacity-70"
      )}
    >
      {/* type icon */}
      <div className={cn("mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-opacity-20", meta.accent.replace('bg-', 'text-').replace('-500', '-600 dark:text-500'), meta.accent.replace('bg-', 'bg-').replace('-500', '-500/10'))}>
        {n.type === "SO_NEEDS_RESTOCK" ? <Package size={14} weight="bold" /> :
         n.type === "SO_RESTOCK_COMPLETE" ? <CheckCircle size={14} weight="bold" /> :
         n.type === "LOW_STOCK" ? <Warning size={14} weight="bold" /> :
         n.type === "SO_NUDGE_RESTOCK" ? <Bell size={14} weight="bold" /> :
         <Info size={14} weight="bold" />}
      </div>

      {/* body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">{meta.label}</span>
            {n.count > 1 && (
              <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                ×{n.count}
              </span>
            )}
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatNotificationTime(n.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">
          {href && n.entityId ? (
            <>
              {summary.split(new RegExp(`(${n.entityId})`, 'i')).map((part, i) => 
                part.toLowerCase() === n.entityId!.toLowerCase() ? (
                  <Link key={i} href={href} className="text-primary hover:underline font-mono text-xs">
                    {part}
                  </Link>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </>
          ) : (
            summary
          )}
        </p>
        {n.message && summary !== n.message && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
        )}
      </div>

      {/* actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!n.isRead && onMarkRead && (
          <button
            type="button"
            onClick={onMarkRead}
            title="Mark as read"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Check size={13} />
          </button>
        )}
        {href && (
          <Link
            href={href}
            title="Open order"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  )
}

