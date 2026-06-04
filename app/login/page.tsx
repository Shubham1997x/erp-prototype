"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-users"
import { fetchCredentials, storeUser } from "@/lib/client-auth"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)

  async function doLogin(loginEmail: string, loginPassword: string) {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: fetchCredentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Login failed"); return }
      storeUser(data.user)
      toast.success(`Welcome, ${data.user.name}!`)
      router.push("/dashboard")
    } catch {
      toast.error("Network error — please try again")
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    await doLogin(email, password)
  }

  async function quickLogin(acc: typeof DEMO_ACCOUNTS[0]) {
    setEmail(acc.email)
    setPassword(DEMO_PASSWORD)
    await doLogin(acc.email, DEMO_PASSWORD)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <div className="flex justify-center">
            <div className="size-12 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <img src="/logo.svg" className="size-8" alt="ShirtCo" />
            </div>
          </div>
          <h1 className="text-2xl font-heading font-bold">ShirtCo ERP</h1>
          <p className="text-sm text-muted-foreground">Manufacturing Management System</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your work email and password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@shirtco.in"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Demo accounts */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Login — click any account below</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-1.5">
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                onClick={() => quickLogin(acc)}
                className="text-left px-2.5 py-2 rounded-lg border text-xs hover:bg-accent transition-colors"
              >
                <div className="font-medium">{acc.name}</div>
                <div className="text-muted-foreground">{acc.role}</div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
