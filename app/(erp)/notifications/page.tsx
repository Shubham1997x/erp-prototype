"use client"

import { useMemo } from "react"
import { Check, Bell, ArrowRight } from "@phosphor-icons/react"
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

function useGrouped(items: AppNotification[]) {
  return useMemo(() => {
    const map = new Map<string, AppNotification[]>()
    for (const n of items) {
      const k = groupKey(n.type)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    // Order groups
    const ordered: { key: string; label: string; items: AppNotification[] }[] = []
    for (const k of GROUP_ORDER) {
      if (map.has(k)) ordered.push({ key: k, label: GROUP_LABELS[k], items: map.get(k)! })
    }
    // Any remaining keys not in GROUP_ORDER
    for (const [k, its] of map.entries()) {
      if (!ordered.find((g) => g.key === k)) {
        ordered.push({ key: k, label: GROUP_LABELS[k] ?? k, items: its })
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
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </p>
        </div>
        {unread > 0 && (
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

      {/* Unread section */}
      {unreadItems.length > 0 && (
        <section className="mb-8">
          <SectionHeading label="Unread" count={unreadItems.length} accent />
          <div className="mt-2 divide-y rounded-xl border bg-card overflow-hidden">
            {unreadItems.map((n) => (
              <NotifRow key={n.id} n={n} onMarkRead={() => void markRead(n.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Read — grouped by type */}
      {readItems.length > 0 && (
        <section>
          <SectionHeading label="Earlier" count={readItems.length} />
          <div className="mt-2 space-y-6">
            {groups
              .map((g) => ({ ...g, items: g.items.filter((n) => n.isRead) }))
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key}>
                  <GroupLabel label={g.label} type={g.key} />
                  <div className="mt-1.5 divide-y rounded-xl border bg-card overflow-hidden">
                    {g.items.map((n) => (
                      <NotifRow key={n.id} n={n} muted />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
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
  n: AppNotification
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
      {/* type dot */}
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.accent)} aria-hidden />

      {/* body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">{meta.label}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatNotificationTime(n.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium leading-snug text-foreground">{summary}</p>
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
