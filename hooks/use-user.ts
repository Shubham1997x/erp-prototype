"use client"

import { useState, useEffect } from "react"
import type { UserRole } from "@/lib/types"

export interface DevUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export function useUser() {
  const [user, setUser] = useState<DevUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("current_user")
    if (stored) {
      try {
        setUser(JSON.parse(stored))
      } catch {
        setUser({ id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin" })
      }
    } else {
      setUser({ id: "usr-1", name: "Arjun Mehta", email: "arjun@shirtco.in", role: "Admin" })
    }
    setLoading(false)
  }, [])

  return {
    user,
    loading,
    role: user?.role,
    isAdmin: user?.role === "Admin",
    isSales: user?.role === "Sales Executive" || user?.role === "Admin",
    isInventory: user?.role === "Inventory Manager" || user?.role === "Admin",
  }
}
