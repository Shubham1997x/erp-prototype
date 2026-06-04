"use client"

import { useFetch } from "@/hooks/use-api"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Package, ArrowLeft, Warning, CheckCircle } from "@phosphor-icons/react"
import type { Product } from "@/lib/types"
import { cn } from "@/lib/utils"

function formatINR(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)
}

export default function ProductDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { data: product, loading, error } = useFetch<Product>(`/api/products/${id}`)

  if (loading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-1/3 bg-muted rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 aspect-square bg-muted rounded-xl"></div>
          <div className="md:col-span-2 space-y-4">
            <div className="h-6 w-1/2 bg-muted rounded"></div>
            <div className="h-6 w-1/4 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="p-6 text-center text-muted-foreground mt-20">
        <h2 className="text-xl font-bold mb-2 text-foreground">Product not found</h2>
        <p>The product you are looking for does not exist or has been removed.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/products")}>
          <ArrowLeft size={16} className="mr-2" /> Back to Products
        </Button>
      </div>
    )
  }

  const isLow = product.currentStock < 10

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <title>{product.name} | ShirtCo ERP</title>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/products")}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{product.sku}</p>
        </div>
        <div className="ml-auto">
          <span className={cn(
            "badge-status px-3 py-1 text-sm font-semibold",
            isLow ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
          )}>
            {isLow ? <Warning size={16} className="mr-1 inline-block" /> : <CheckCircle size={16} className="mr-1 inline-block" />}
            {isLow ? "Low Stock" : "In Stock"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Image */}
        <div className="md:col-span-1">
          <div className="aspect-square rounded-2xl border bg-card shadow-sm overflow-hidden flex items-center justify-center p-2 relative">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <Package size={80} className="text-muted-foreground/30" />
            )}
          </div>
        </div>

        {/* Right Column: Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Selling Price</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatINR(product.price)}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Unit</p>
              <p className="text-2xl font-bold text-foreground mt-1">{product.unitOfMeasure}</p>
            </div>
            <div className="stat-card border-emerald-500/30 bg-emerald-500/5">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Available Stock</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{product.currentStock}</p>
            </div>
            <div className="stat-card">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Reserved Stock</p>
              <p className="text-2xl font-bold text-foreground mt-1">{product.reservedStock || 0}</p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-lg mb-4">Product Information</h3>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              <div>
                <p className="text-muted-foreground">Category</p>
                <p className="font-medium">{product.category || "Uncategorized"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Standard Cost</p>
                <p className="font-medium">{product.standardCost ? formatINR(product.standardCost) : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Unit Cost</p>
                <p className="font-medium">{product.unitCost ? formatINR(product.unitCost) : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{product.isActive === false ? "Inactive" : "Active"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
