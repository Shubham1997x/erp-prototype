import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const db = getDb()

  const rawMaterials = db.prepare(`
    SELECT id, name, unit, current_stock, reserved_stock, reorder_point, supplier_id, unit_cost
    FROM raw_materials
    WHERE is_active = 1
    ORDER BY name ASC
  `).all() as {
    id: string; name: string; unit: string; current_stock: number; reserved_stock: number;
    reorder_point: number; supplier_id: string; unit_cost: number;
  }[]

  const products = db.prepare(`
    SELECT id, name, sku, unit_of_measure, current_stock, reserved_stock, unit_cost, standard_cost, price, category
    FROM products
    WHERE is_active = 1
    ORDER BY name ASC
  `).all() as {
    id: string; name: string; sku: string; unit_of_measure: string; current_stock: number;
    reserved_stock: number; unit_cost: number; standard_cost: number; price: number; category: string;
  }[]

  const rmData = rawMaterials.map(rm => {
    const availableStock = rm.current_stock - (rm.reserved_stock ?? 0)
    const stockValue     = rm.current_stock * (rm.unit_cost ?? 0)
    const status =
      rm.current_stock <= 0             ? "OUT_OF_STOCK" :
      availableStock <= rm.reorder_point ? "LOW_STOCK"    : "OK"
    return {
      id: rm.id, name: rm.name, unit: rm.unit,
      currentStock: rm.current_stock, reservedStock: rm.reserved_stock,
      availableStock, reorderPoint: rm.reorder_point,
      unitCost: rm.unit_cost, stockValue,
      status,
    }
  })

  const fgData = products.map(p => {
    const availableStock = p.current_stock - (p.reserved_stock ?? 0)
    const stockValue     = p.current_stock * (p.unit_cost ?? 0)
    return {
      id: p.id, name: p.name, sku: p.sku,
      currentStock: p.current_stock, reservedStock: p.reserved_stock,
      availableStock,
      unitCost: p.unit_cost, standardCost: p.standard_cost,
      stockValue, price: p.price, category: p.category,
    }
  })

  const totalRMValue    = rmData.reduce((s, r) => s + (r.stockValue ?? 0), 0)
  const totalFGValue    = fgData.reduce((s, f) => s + (f.stockValue ?? 0), 0)
  const lowStockCount   = rmData.filter(r => r.status === "LOW_STOCK").length
  const outOfStockCount = rmData.filter(r => r.status === "OUT_OF_STOCK").length +
                          fgData.filter(f => f.currentStock <= 0).length

  return NextResponse.json({
    rawMaterials: rmData,
    products: fgData,
    summary: {
      totalRMValue,
      totalFGValue,
      totalInventoryValue: totalRMValue + totalFGValue,
      lowStockCount,
      outOfStockCount,
    },
  })
}
