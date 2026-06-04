"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { AUTH_CHANGED_EVENT, fetchCredentials, getAuthHeaders } from "@/lib/client-auth"

export const NOTIFICATIONS_CHANGED_EVENT = "erp:notifications-changed"
const NOTIF_PING_KEY = "erp:notif-ping"
const POLL_MS = 20_000

export interface AppNotification {
  id: string
  title: string
  message: string
  entityType?: string
  entityId?: string
  isRead: boolean
  createdAt: string
  type?: string
}

type NotificationContextValue = {
  items: AppNotification[]
  unread: number
  loading: boolean
  refresh: () => Promise<void>
  markAllRead: () => Promise<void>
  markRead: (id: string) => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

function resetSeenState(
  seenIdsRef: MutableRefObject<Set<string>>,
  bootstrappedRef: MutableRefObject<boolean>
) {
  seenIdsRef.current.clear()
  bootstrappedRef.current = false
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const inflightRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    if (inflightRef.current) return
    inflightRef.current = true
    try {
      const res = await fetch("/api/notifications", {
        credentials: fetchCredentials,
        headers: getAuthHeaders(),
        cache: "no-store",
      })
      if (!res.ok) return

      const json = (await res.json()) as { data: AppNotification[]; unread: number }
      setItems(json.data ?? [])
      setUnread(json.unread ?? 0)
    } catch {
      /* ignore */
    } finally {
      inflightRef.current = false
      setLoading(false)
    }
  }, [])

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void refresh(), 350)
  }, [refresh])

  const markAllRead = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: fetchCredentials,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) return
      const json = (await res.json()) as { unread: number }
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnread(json.unread ?? 0)
    } catch {
      /* ignore */
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        credentials: fetchCredentials,
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) return
      const json = (await res.json()) as { unread: number }
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
      setUnread(json.unread ?? 0)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), POLL_MS)

    function onChanged() {
      scheduleRefresh()
    }

    function onVisible() {
      if (document.visibilityState === "visible") scheduleRefresh()
    }

    function onAuthChanged() {
      setLoading(true)
      void refresh()
    }

    function onStoragePing(e: StorageEvent) {
      if (e.key === NOTIF_PING_KEY) scheduleRefresh()
    }

    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
    window.addEventListener("focus", onChanged)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    window.addEventListener("storage", onStoragePing)

    return () => {
      clearInterval(interval)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged)
      window.removeEventListener("focus", onChanged)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
      window.removeEventListener("storage", onStoragePing)
    }
  }, [refresh, scheduleRefresh])

  return (
    <NotificationContext.Provider
      value={{ items, unread, loading, refresh, markAllRead, markRead }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider")
  }
  return ctx
}

export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
  try {
    localStorage.setItem(NOTIF_PING_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}
