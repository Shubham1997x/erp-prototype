"use client"

import { useState } from "react"
import Link from "next/link"
import { Bell, Check } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useNotifications } from "@/components/providers/notification-provider"
import {
  formatNotificationTime,
  notificationSummary,
  notificationTypeMeta,
} from "@/lib/notification-display"

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { items, unread, loading, refresh, markAllRead, markRead } = useNotifications()

  async function openPanel() {
    const next = !open
    setOpen(next)
    if (next) {
      await refresh()
    }
  }

  async function handleMarkAllRead() {
    await markAllRead()
  }

  async function handleOpenItem(id: string, isRead: boolean) {
    if (!isRead) await markRead(id)
    setOpen(false)
  }

  const unreadItems = items.filter((n) => !n.isRead)
  const readItems = items.filter((n) => n.isRead)

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative size-8"
        onClick={() => void openPanel()}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border bg-popover shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold leading-none">Notifications</p>
                {unread > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">{unread} unread</p>
                )}
              </div>
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => void handleMarkAllRead()}
                >
                  <Check size={14} />
                  Clear
                </Button>
              )}
            </div>

            <div className="max-h-[min(20rem,50vh)] overflow-y-auto">
              {loading && items.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  You&apos;re all caught up
                </p>
              ) : (
                <>
                  {unreadItems.length > 0 && (
                    <ul className="py-1">
                      {unreadItems.map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          onSelect={() => void handleOpenItem(n.id, n.isRead)}
                        />
                      ))}
                    </ul>
                  )}
                  {readItems.length > 0 && unreadItems.length > 0 && (
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Earlier
                    </p>
                  )}
                  {readItems.length > 0 && (
                    <ul className={cn("py-1", unreadItems.length === 0 && "")}>
                      {readItems.map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          muted
                          onSelect={() => void handleOpenItem(n.id, n.isRead)}
                        />
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NotificationRow({
  n,
  muted,
  onSelect,
}: {
  n: {
    id: string
    title: string
    message: string
    type?: string
    entityType?: string
    entityId?: string
    isRead: boolean
    createdAt: string
  }
  muted?: boolean
  onSelect: () => void
}) {
  const meta = notificationTypeMeta(n.type)
  const summary = notificationSummary(n.title, n.message, n.entityId)
  const href =
    n.entityType === "sales_order" && n.entityId ? `/orders/${n.entityId}` : undefined

  const rowClass = cn(
    "flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/60",
    !n.isRead && !muted && "bg-primary/[0.04]",
    muted && "opacity-70"
  )

  const content = (
    <>
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.accent)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">{meta.label}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {formatNotificationTime(n.createdAt)}
          </span>
        </div>
        <p className="text-xs font-medium leading-snug text-foreground line-clamp-2">{summary}</p>
      </div>
    </>
  )

  if (href) {
    return (
      <li>
        <Link href={href} onClick={onSelect} className={rowClass}>
          {content}
        </Link>
      </li>
    )
  }

  return (
    <li>
      <button type="button" onClick={onSelect} className={cn(rowClass, "w-full text-left")}>
        {content}
      </button>
    </li>
  )
}
