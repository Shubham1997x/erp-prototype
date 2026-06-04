"use client"

export const AUTH_USER_KEY = "current_user"
export const AUTH_CHANGED_EVENT = "erp:user-changed"

export interface ClientUser {
  id: string
  name: string
  email: string
  role: string
}

export function readStoredUser(): ClientUser | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(AUTH_USER_KEY)
    if (!stored) return null
    return JSON.parse(stored) as ClientUser
  } catch {
    return null
  }
}

export function storeUser(user: ClientUser) {
  const prev = readStoredUser()
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  if (prev?.id !== user.id || prev?.role !== user.role) {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  }
}

export function clearStoredUser() {
  localStorage.removeItem(AUTH_USER_KEY)
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

/** Headers for API calls; session cookie is the source of truth on the server. */
export function getAuthHeaders(): Record<string, string> {
  const user = readStoredUser()
  if (!user) return {}
  return { "X-User-Id": String(user.id), "X-User-Role": String(user.role) }
}

export const fetchCredentials: RequestCredentials = "include"
