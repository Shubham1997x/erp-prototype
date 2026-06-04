export type NotificationType =
  | "SO_NEEDS_RESTOCK"
  | "SO_RESTOCK_COMPLETE"
  | "SO_NUDGE_RESTOCK"
  | "LOW_STOCK"
  | string

const TYPE_META: Record<string, { label: string; accent: string }> = {
  SO_NEEDS_RESTOCK: { label: "Restock needed", accent: "bg-amber-500" },
  SO_RESTOCK_COMPLETE: { label: "Ready to ship", accent: "bg-emerald-500" },
  SO_NUDGE_RESTOCK: { label: "Nudge", accent: "bg-sky-500" },
  LOW_STOCK: { label: "Low stock", accent: "bg-orange-500" },
}

export function notificationTypeMeta(type?: string) {
  if (type && TYPE_META[type]) return TYPE_META[type]
  return { label: "Update", accent: "bg-primary" }
}

export function formatNotificationTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

/** One-line summary for list UI (avoids title + long message duplication). */
export function notificationSummary(
  title: string,
  message: string,
  entityId?: string
): string {
  const orderRef = entityId?.match(/so-[\w-]+/i)?.[0] ?? entityId
  if (orderRef && title.includes(orderRef)) return title
  if (orderRef && !title.toLowerCase().includes(orderRef.toLowerCase())) {
    return `${title.replace(/\s*—\s*$/, "")} · ${orderRef}`
  }
  if (message.length <= 72) return message
  return message.slice(0, 69) + "…"
}
