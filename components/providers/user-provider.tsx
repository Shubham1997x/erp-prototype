"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { UserRole } from "@/lib/types"
import {
  AUTH_CHANGED_EVENT,
  AUTH_USER_KEY,
  clearStoredUser,
  fetchCredentials,
  getAuthHeaders,
  readStoredUser,
  storeUser,
  type ClientUser,
} from "@/lib/client-auth"

export type DevUser = ClientUser & { role: UserRole }

type UserContextValue = {
  user: DevUser | null
  loading: boolean
  refresh: () => Promise<DevUser | null>
  isAdmin: boolean
  isSales: boolean
  isInventory: boolean
}

const UserContext = createContext<UserContextValue | null>(null)

let sessionInflight: Promise<DevUser | null> | null = null

async function fetchSessionOnce(): Promise<DevUser | null> {
  if (sessionInflight) return sessionInflight

  sessionInflight = (async () => {
    const res = await fetch("/api/auth/session", {
      credentials: fetchCredentials,
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    if (!res.ok) {
      clearStoredUser()
      return null
    }
    const data = (await res.json()) as { user: DevUser }
    if (!data.user) {
      clearStoredUser()
      return null
    }
    storeUser(data.user)
    return data.user
  })().finally(() => {
    sessionInflight = null
  })

  return sessionInflight
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DevUser | null>(() => readStoredUser() as DevUser | null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const sessionUser = await fetchSessionOnce()
    setUser(sessionUser)
    setLoading(false)
    return sessionUser
  }, [])

  useEffect(() => {
    void refresh()

    function onAuthChanged() {
      setUser(readStoredUser() as DevUser | null)
    }

    function onStorage(e: StorageEvent) {
      if (e.key === AUTH_USER_KEY) onAuthChanged()
    }

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
      window.removeEventListener("storage", onStorage)
    }
  }, [refresh])

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      refresh,
      isAdmin: user?.role === "Admin",
      isSales: user?.role === "Sales Executive" || user?.role === "Admin",
      isInventory: user?.role === "Inventory Manager" || user?.role === "Admin",
    }),
    [user, loading, refresh]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider")
  }
  return ctx
}
