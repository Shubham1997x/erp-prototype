"use client"

import { useMemo, useState } from "react"
import {
  Check,
  Bell,
  ArrowRight,
  Package,
  Warning,
  Info,
  CheckCircle,
} from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import Link from "next/link"
import {
  useNotifications,
  type AppNotification,
} from "@/components/providers/notification-provider"
import {
  formatNotificationTime,
  formatNotificationTimeFull,
  notificationSummary,
  notificationTypeMeta,
} from "@/lib/notification-display"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupedNotification extends AppNotification {
  count: number
  ids: string[]
}

type FilterTab = "all" | "unread" | "read"

// ─── Grouping helpers ─────────────────────────────────────────────────────────

const GROUP_ORDER = [
  "SO_NEEDS_RESTOCK",
  "SO_RESTOCK_COMPLETE",
  "SO_NUDGE_RESTOCK",
  "LOW_STOCK",
  "__other__",
] as const

function groupKey(type?: string): string {
  if (!type) return "__other__"
  if (
    [
      "SO_NEEDS_RESTOCK",
      "SO_RESTOCK_COMPLETE",
      "SO_NUDGE_RESTOCK",
      "LOW_STOCK",
    ].includes(type)
  )
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

function deduplicate(items: AppNotification[]): GroupedNotification[] {
  const map = new Map<string, GroupedNotification>()
  for (const n of items) {
    const key = `${n.type}-${n.entityId}-${n.title}`
    if (map.has(key)) {
      const existing = map.get(key)!
      existing.count += 1
      existing.ids.push(n.id)
      if (new Date(n.createdAt) > new Date(existing.createdAt)) {
        existing.createdAt = n.createdAt
      }
    } else {
      map.set(key, { ...n, count: 1, ids: [n.id] })
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

function useGrouped(items: AppNotification[]) {
  return useMemo(() => {
    const map = new Map<string, AppNotification[]>()
    for (const n of items) {
      const k = groupKey(n.type)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(n)
    }
    const ordered: {
      key: string
      label: string
      items: GroupedNotification[]
    }[] = []
    for (const k of GROUP_ORDER) {
      if (map.has(k))
        ordered.push({
          key: k,
          label: GROUP_LABELS[k],
          items: deduplicate(map.get(k)!),
        })
    }
    for (const [k, its] of map.entries()) {
      if (!ordered.find((g) => g.key === k)) {
        ordered.push({
          key: k,
          label: GROUP_LABELS[k] ?? k,
          items: deduplicate(its),
        })
      }
    }
    return ordered
  }, [items])
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { items, unread, loading, markAllRead, markRead } = useNotifications()
  const [activeTab, setActiveTab] = useState<FilterTab>("all")

  const unreadItems = items.filter((n) => !n.isRead)
  const readItems = items.filter((n) => n.isRead)

  const visibleUnread = activeTab !== "read" ? unreadItems : []
  const visibleRead = activeTab !== "unread" ? readItems : []

  const groups = useGrouped(visibleRead)

  const isEmpty = visibleUnread.length === 0 && visibleRead.length === 0

  return (
    <div className="flex min-h-full flex-col">
      <title>Notifications | ShirtCo ERP</title>

      {/* Sticky header */}
      <div className="sticky top-0 z-10  bg-background/80 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            {unread > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                {unread} unread
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter tabs */}
            <div className="flex rounded-lg   p-0.5 text-xs font-medium">
              {(["all", "unread", "read"] as FilterTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-md px-3 py-1 capitalize transition-colors",
                    activeTab === tab
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab}
                  {tab === "unread" && unread > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-bold text-primary">
                      {unread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => void markAllRead()}
              >
                <Check size={13} />
                Mark all read
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-5 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* Loading */}
          {loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-24">
              <Bell
                size={32}
                className="animate-pulse text-muted-foreground/40"
              />
              <p className="text-sm text-muted-foreground">
                Loading notifications…
              </p>
            </div>
          )}

          {/* Empty state */}
          {!loading && isEmpty && (
            <div className="flex flex-col items-center gap-3 py-24">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
                <Check size={28} className="text-emerald-500" weight="bold" />
              </div>
              <p className="text-base font-semibold">
                {activeTab === "unread"
                  ? "No unread notifications"
                  : "You're all caught up!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {activeTab === "unread"
                  ? "Switch to “All” to see your history."
                  : "No notifications yet."}
              </p>
            </div>
          )}

          {/* Unread section */}
          {visibleUnread.length > 0 && (
            <section>
              <SectionHeading
                label="Unread"
                count={visibleUnread.length}
                accent
                onMarkAll={() => void markAllRead()}
              />
              <div className="mt-2 divide-y overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                {deduplicate(visibleUnread).map((n) => (
                  <NotifRow
                    key={n.ids.join(",")}
                    n={n}
                    onMarkRead={() => n.ids.forEach((id) => void markRead(id))}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Read — grouped by type */}
          {groups
            .map((g) => ({ ...g, items: g.items.filter((n) => n.isRead) }))
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.key}>
                <GroupLabel label={g.label} type={g.key} />
                <div className="mt-1.5 divide-y overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                  {g.items.map((n) => (
                    <NotifRow key={n.ids.join(",")} n={n} muted />
                  ))}
                </div>
              </section>
            ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeading({
  label,
  count,
  accent,
  onMarkAll,
}: {
  label: string
  count: number
  accent?: boolean
  onMarkAll?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2
          className={cn(
            "text-xs font-bold tracking-wider uppercase",
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
      {onMarkAll && (
        <button
          type="button"
          onClick={onMarkAll}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Check size={11} />
          Mark all read
        </button>
      )}
    </div>
  )
}

function GroupLabel({ label, type }: { label: string; type: string }) {
  const meta = notificationTypeMeta(type === "__other__" ? undefined : type)
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={cn("size-2 rounded-full", meta.accent)} />
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
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
    n.entityType === "sales_order" && n.entityId
      ? `/orders/${n.entityId}`
      : undefined

  function handleRowClick() {
    if (!n.isRead) onMarkRead?.()
  }

  const iconColorClass = meta.accent
    .replace("bg-", "text-")
    .replace("-500", "-600")
  const iconBgClass = meta.accent.replace("-500", "-500/10")

  return (
    <div
      className={cn(
        "group flex cursor-default items-start gap-3 px-4 py-3 transition-colors",
        !n.isRead && "bg-primary/[0.035] hover:bg-primary/[0.06]",
        n.isRead && "hover:bg-muted/40",
        muted && "opacity-60 hover:opacity-100"
      )}
      onClick={handleRowClick}
    >
      {/* Unread dot */}
      <div className="mt-2.5 flex w-2 shrink-0 justify-center">
        {!n.isRead && (
          <span className={cn("size-2 rounded-full", meta.accent)} />
        )}
      </div>

      {/* Type icon */}
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          iconBgClass,
          iconColorClass
        )}
      >
        {n.type === "SO_NEEDS_RESTOCK" ? (
          <Package size={14} weight="bold" />
        ) : n.type === "SO_RESTOCK_COMPLETE" ? (
          <CheckCircle size={14} weight="bold" />
        ) : n.type === "LOW_STOCK" ? (
          <Warning size={14} weight="bold" />
        ) : n.type === "SO_NUDGE_RESTOCK" ? (
          <Bell size={14} weight="bold" />
        ) : (
          <Info size={14} weight="bold" />
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {meta.label}
            </span>
            {n.count > 1 && (
              <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                ×{n.count}
              </span>
            )}
          </div>
          <span
            className="shrink-0 cursor-default text-[10px] text-muted-foreground tabular-nums"
            title={formatNotificationTimeFull(n.createdAt)}
          >
            {formatNotificationTime(n.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-snug font-medium text-foreground">
          {href && n.entityId ? (
            <>
              {summary
                .split(new RegExp(`(${n.entityId})`, "i"))
                .map((part, i) =>
                  part.toLowerCase() === n.entityId!.toLowerCase() ? (
                    <Link
                      key={i}
                      href={href}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs text-primary hover:underline"
                    >
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
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {n.message}
          </p>
        )}
      </div>

      {/* Actions — visible at low opacity, full on hover */}
      <div className="flex shrink-0 items-center gap-1 opacity-30 transition-opacity group-hover:opacity-100">
        {!n.isRead && onMarkRead && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onMarkRead()
            }}
            title="Mark as read"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Check size={13} />
          </button>
        )}
        {href && (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            title="Open order"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  )
}
