"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-users"
import { fetchCredentials, storeUser } from "@/lib/client-auth"
import {
  Scissors,
  Sparkles,
  Ruler,
  Shirt,
  Layers,
  Users,
  ShieldCheck,
  Coins,
  Wrench,
  Mail,
  Lock,
  ArrowRight
} from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

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
      if (!res.ok) {
        toast.error(data.error ?? "Login failed")
        return
      }
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

  async function quickLogin(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acc.email)
    setPassword(DEMO_PASSWORD)
    await doLogin(acc.email, DEMO_PASSWORD)
  }

  // Map roles to helper icons for the quick log-in section
  function getRoleIcon(role: string) {
    switch (role.toLowerCase()) {
      case "admin": return <ShieldCheck className="size-4 text-indigo-500" />
      case "sales manager": return <Coins className="size-4 text-emerald-500" />
      case "production manager": return <Wrench className="size-4 text-amber-500" />
      default: return <Users className="size-4 text-blue-500" />
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-background overflow-hidden">
      {/* LEFT PANEL: Smaller (5 cols), featuring high-quality Unsplash image and overlay */}
      <div className="hidden lg:flex lg:col-span-5 relative overflow-hidden flex-col justify-between p-10 select-none border-r border-border/20">

        {/* Unsplash shirt background image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-10000 hover:scale-105"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1603252109303-2751441dd157?q=80&w=1200&auto=format&fit=crop')",
          }}
        />

        {/* Sophisticated Dark/Indigo overlay layer */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/85 to-indigo-950/90 backdrop-blur-[2px]" />

        {/* Subtle Tech Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#3b82f6_1px,transparent_1px),linear-gradient(to_bottom,#3b82f6_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-[0.07]" />

        {/* Ambient Glows */}
        <div className="absolute -top-20 -left-20 size-[350px] rounded-full bg-violet-600/30 blur-[96px] animate-pulse-glow" />
        <div className="absolute -bottom-20 -right-20 size-[350px] rounded-full bg-fuchsia-600/20 blur-[96px] animate-pulse-glow" style={{ animationDelay: "2s" }} />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-tr from-primary to-violet-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Shirt className="size-5 text-white" />
          </div>
          <div>
            <span className="font-heading font-extrabold text-xl text-white tracking-tight">ShirtCo</span>
            <span className="ml-1.5 text-xs px-2 py-0.5 rounded bg-white/10 text-white/80 font-medium">ERP</span>
          </div>
        </div>



        {/* Footer branding */}
        <div className="relative z-10 text-white/60">
          <h2 className="text-lg font-semibold text-white">Precision Manufacturing.</h2>
          <p className="text-xs text-slate-300 mt-1.5 max-w-sm leading-relaxed">
            Manage fabric stocks, track order lines, and automate quality checks.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL: Bigger (7 cols), centered content with generous spacing */}
      <div className="col-span-12 lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-16 relative bg-background">

        {/* Subtle background glow */}
        <div className="absolute -top-40 -right-40 size-[500px] rounded-full bg-primary/5 blur-[128px] pointer-events-none" />

        <div className="w-full max-w-lg space-y-8">
          {/* Logo / Header */}
          <div className="text-center space-y-2 lg:text-left lg:flex lg:flex-col lg:items-start">
            <div className="flex justify-center lg:justify-start">
              <div className="size-12 rounded-2xl bg-slate-950 flex items-center justify-center shadow-xl shadow-slate-950/20 border border-white/10 overflow-hidden">
                <Image src="/logo.jpg" width={48} height={48} className="size-full object-cover" alt="ShirtCo" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-heading font-extrabold tracking-tight mt-3">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your ShirtCo Manufacturing account</p>
            </div>
          </div>

          {/* Login Card */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-md shadow-xl rounded-2xl overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
            <CardHeader className="pb-4 pt-6">
              <CardTitle className="text-lg">Sign in</CardTitle>
              <CardDescription>Enter your credentials to access the ERP</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@shirtco.in"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="pl-9 h-10 rounded-xl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-9 h-10 rounded-xl"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-10 rounded-xl font-medium shadow-md shadow-primary/10 hover:shadow-primary/20 transition-all gap-2" disabled={loading}>
                  {loading ? (
                    "Signing in..."
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Quick Login Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <Sparkles className="size-3.5 text-violet-500 animate-pulse" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Login & Testing</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {DEMO_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => quickLogin(acc)}
                  className="group relative text-left p-3.5 rounded-xl border border-border/60 bg-card/40 hover:bg-accent/50 transition-all hover:border-primary/30 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-muted group-hover:bg-background transition-colors">
                      {getRoleIcon(acc.role)}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">{acc.name}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">{acc.role}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
