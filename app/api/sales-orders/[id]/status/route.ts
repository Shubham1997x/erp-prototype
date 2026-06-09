import { getSupabase } from "@/lib/supabase"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog, createNotification } from "@/lib/audit"
import { newId } from "@/lib/core"
import { SO_TRANSITIONS } from "@/lib/types"
import type { SalesOrderStatus } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try {
    auth = await requireNotViewer(req)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const { id } = await ctx.params
  const { status, promisedDeliveryDate } = await req.json()
  const supabase = getSupabase()
  const now = new Date().toISOString()

  try {
    const { data: order } = await supabase.from("sales_orders").select().eq("id", id).single()
    if (!order) throw new Error("Sales order not found")
    const orderNum = order.order_number ?? id
    const current = order.status as SalesOrderStatus

    const allowed = SO_TRANSITIONS[current] ?? []
    if (!allowed.includes(status as SalesOrderStatus)) {
      throw new Error(
        `Invalid transition: ${current} → ${status}. Allowed: ${allowed.join(", ") || "none"}`
      )
    }

    let effectiveStatus = status as SalesOrderStatus
    let stockShortages: { productId: string; name: string; required: number; available: number }[] | undefined

    // APPROVED: check stock, reserve, or flag NEEDS_RESTOCK
    if (status === "APPROVED") {
      const { data: lines } = await supabase
        .from("sales_order_lines")
        .select("product_id, qty")
        .eq("order_id", id)

      stockShortages = []
      for (const line of lines ?? []) {
        const { data: product } = await supabase
          .from("products")
          .select("id, name, current_stock")
          .eq("id", line.product_id)
          .single()
        if (!product) throw new Error(`Product not found: ${line.product_id}`)
        if (product.current_stock < line.qty) {
          stockShortages.push({
            productId: product.id,
            name: product.name,
            required: line.qty,
            available: product.current_stock,
          })
        }
      }

      if (stockShortages.length > 0) {
        effectiveStatus = "NEEDS_RESTOCK"
        await createNotification({
          role: "Inventory Manager",
          type: "SO_NEEDS_RESTOCK",
          title: `Order ${orderNum} needs restock`,
          message: `Order ${orderNum} is short on ${stockShortages.length} product(s).`,
          entityType: "sales_order",
          entityId: id,
        })
      } else {
        for (const line of (lines ?? [])) {
          const { data: existingRes } = await supabase
            .from("inventory_reservations")
            .select("id")
            .eq("reference_id", id)
            .eq("entity_id", line.product_id)
            .eq("is_active", 1)
            .single()
          if (existingRes) continue

          const resId = newId("res")
          await supabase.from("inventory_reservations").insert({
            id: resId,
            entity_type: "product",
            entity_id: line.product_id,
            reserved_qty: line.qty,
            reservation_type: "sales_order",
            reference_id: id,
            reference_type: "sales_order",
            created_by: auth.id,
          })
          const { data: prod } = await supabase
            .from("products")
            .select("reserved_stock")
            .eq("id", line.product_id)
            .single()
          await supabase
            .from("products")
            .update({ reserved_stock: (prod?.reserved_stock ?? 0) + line.qty })
            .eq("id", line.product_id)
        }
        await createNotification({
          role: "Production Manager",
          type: "SO_APPROVED",
          title: `Order ${orderNum} approved`,
          message: `Order ${orderNum} is ready for production planning.`,
          entityType: "sales_order",
          entityId: id,
        })
      }
    }

    // READY_TO_SHIP: validate stock, deduct, release reservations
    if (status === "READY_TO_SHIP") {
      const { data: lines } = await supabase
        .from("sales_order_lines")
        .select("product_id, qty")
        .eq("order_id", id)

      for (const line of lines ?? []) {
        const { data: product } = await supabase
          .from("products")
          .select("name, current_stock")
          .eq("id", line.product_id)
          .single()
        if (!product) throw new Error(`Product not found: ${line.product_id}`)
        if (product.current_stock < line.qty) {
          throw new Error(
            `Insufficient stock for "${product.name}". Required: ${line.qty}, Available: ${product.current_stock}`
          )
        }

        await supabase
          .from("products")
          .update({ current_stock: product.current_stock - line.qty })
          .eq("id", line.product_id)

        await supabase.from("stock_movements").insert({
          entity_type: "product",
          entity_id: line.product_id,
          delta: -line.qty,
          reason: "Order fulfilled",
          reference_type: "sales_order",
          reference_id: id,
          created_by: auth.id,
          created_at: now,
        })

        const { data: reservations } = await supabase
          .from("inventory_reservations")
          .select("reserved_qty")
          .eq("reference_id", id)
          .eq("entity_id", line.product_id)
          .eq("is_active", 1)

        const toRelease = (reservations ?? []).reduce((sum, r) => sum + r.reserved_qty, 0)
        if (toRelease > 0) {
          const { data: prod } = await supabase
            .from("products")
            .select("reserved_stock")
            .eq("id", line.product_id)
            .single()
          await supabase
            .from("products")
            .update({ reserved_stock: Math.max(0, (prod?.reserved_stock ?? 0) - toRelease) })
            .eq("id", line.product_id)
          await supabase
            .from("inventory_reservations")
            .update({ is_active: 0, released_at: now })
            .eq("reference_id", id)
            .eq("entity_id", line.product_id)
            .eq("is_active", 1)
        }
      }
      await createNotification({
        role: "Inventory Manager",
        type: "READY_TO_SHIP",
        title: `Order ${orderNum} ready to ship`,
        message: `Order ${orderNum} is ready for shipment dispatch.`,
        entityType: "sales_order",
        entityId: id,
      })
    }

    // IN_PRODUCTION: auto-create production orders
    if (status === "IN_PRODUCTION") {
      const { data: lines } = await supabase
        .from("sales_order_lines")
        .select("product_id, qty")
        .eq("order_id", id)

      for (const line of lines ?? []) {
        const { data: product } = await supabase
          .from("products")
          .select("bom_id")
          .eq("id", line.product_id)
          .single()
        if (!product) continue

        let bomId = product.bom_id
        if (!bomId) {
          const { data: activeBom } = await supabase
            .from("boms")
            .select("id")
            .eq("product_id", line.product_id)
            .eq("status", "ACTIVE")
            .limit(1)
            .single()
          bomId = activeBom?.id ?? null
        }
        if (!bomId) {
          const { data: anyBom } = await supabase
            .from("boms")
            .select("id")
            .eq("product_id", line.product_id)
            .limit(1)
            .single()
          bomId = anyBom?.id ?? null
        }

        if (bomId) {
          const { data: exists } = await supabase
            .from("production_orders")
            .select("id")
            .eq("sales_order_id", id)
            .eq("product_id", line.product_id)
            .single()

          if (!exists) {
            const poId = newId("prod")
            await supabase.from("production_orders").insert({
              id: poId,
              sales_order_id: id,
              product_id: line.product_id,
              qty: line.qty,
              status: "PLANNED",
              bom_id: bomId,
              notes: `Auto-created from ${id}`,
              created_at: now,
              updated_at: now,
            })
          }
        }
      }
    }

    if (promisedDeliveryDate) {
      await supabase
        .from("sales_orders")
        .update({ promised_delivery_date: promisedDeliveryDate })
        .eq("id", id)
    }

    await supabase
      .from("sales_orders")
      .update({ status: effectiveStatus, updated_at: now, updated_by: auth.id })
      .eq("id", id)

    await writeAuditLog({
      userId: auth.id,
      action: `SO_STATUS_${effectiveStatus}`,
      entityType: "sales_order",
      entityId: id,
      before: { status: current },
      after: stockShortages?.length
        ? { status: effectiveStatus, shortages: stockShortages }
        : { status: effectiveStatus },
    })

    return NextResponse.json({
      id,
      status: effectiveStatus,
      updatedAt: now,
      ...(stockShortages?.length ? { shortages: stockShortages } : {}),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
