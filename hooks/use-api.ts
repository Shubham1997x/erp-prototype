"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchCredentials, getAuthHeaders } from "@/lib/client-auth"

const inflightByUrl = new Map<string, Promise<unknown>>()
const dataCache = new Map<string, unknown>()

export function clearApiCache() {
  dataCache.clear()
}

async function fetchJson<T>(url: string): Promise<T> {
  const existing = inflightByUrl.get(url)
  if (existing) return existing as Promise<T>

  const promise = (async () => {
    const res = await fetch(url, {
      cache: "no-store",
      credentials: fetchCredentials,
      headers: getAuthHeaders(),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    dataCache.set(url, data)
    return data as T
  })().finally(() => {
    inflightByUrl.delete(url)
  })

  inflightByUrl.set(url, promise)
  return promise
}

export function useFetch<T>(url: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(() => (dataCache.get(url) as T) || null)
  const [loading, setLoading] = useState(!dataCache.has(url))
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!dataCache.has(url)) setLoading(true)
    setError(null)
    try {
      const json = await fetchJson<T>(url)
      if (mounted.current) {
        setData(json)
        setLoading(false)
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : "Unknown error")
        setLoading(false)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])

  useEffect(() => {
    mounted.current = true
    load()
    return () => { mounted.current = false }
  }, [load])

  return { data, loading, error, refetch: load }
}

export async function apiPost<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: fetchCredentials,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  clearApiCache()
  return res.json()
}

export async function apiPatch<T = unknown>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: fetchCredentials,
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  clearApiCache()
  return res.json()
}

export async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE", credentials: fetchCredentials, headers: getAuthHeaders() })
  if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
  clearApiCache()
}

