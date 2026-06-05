import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireNotViewer } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { newId } from "@/lib/core"
import { enrichOrder } from "@/lib/sales-order-enrich"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const db  = getDb()
  const url = new URL(req.url)
  const page   = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"))
  const limit  = Math.min(200, parseInt(url.searchParams.get("limit") ?? "100"))
  const offset = (page - 1) * limit
  const status = url.searchParams.get("status")
  const search = url.searchParams.get("q")

  let conditions: string[] = []
  let params: unknown[] = []

  if (status) {
    if (status.includes(",")) {
      const statuses = status.split(",")
      conditions.push(`so.status IN (${statuses.map(() => "?").join(",")})`)
      params.push(...statuses)
    } else {
      conditions.push("so.status = ?")
      params.push(status)
    }
  }

  if (search) {
    conditions.push("(so.id LIKE ? OR c.name LIKE ? OR so.notes LIKE ?)")
    const like = `%${search}%`
    params.push(like, like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const countQuery = `
    SELECT COUNT(*) as n 
    FROM sales_orders so
    LEFT JOIN customers c ON c.id = so.customer_id
    ${where}
  `
  const total = (db.prepare(countQuery).get(...params) as { n: number }).n

  const dataQuery = `
    SELECT so.* 
    FROM sales_orders so
    LEFT JOIN customers c ON c.id = so.customer_id
    ${where} 
    ORDER BY so.created_at DESC 
    LIMIT ? OFFSET ?
  `
  const rows = db.prepare(dataQuery).all(...params, limit, offset) as Record<string, unknown>[]

  return NextResponse.json({ data: rows.map(r => enrichOrder(db, r)), total, page, limit })
}

export async function POST(req: Request) {
  let auth: Awaited<ReturnType<typeof requireNotViewer>>
  try { auth = await requireNotViewer(req) } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  }

  const body = await req.json()
  const db   = getDb()
  const id   = newId("so")
  const now  = new Date().toISOString()

  if (!body.customerId) return NextResponse.json({ error: "customerId is required" }, { status: 400 })
  if (!body.lines?.length) return NextResponse.json({ error: "At least one order line is required" }, { status: 400 })

  for (const line of body.lines) {
    if (!line.productId) return NextResponse.json({ error: "Each line needs a productId" }, { status: 400 })
    if (!line.qty || line.qty <= 0) return NextResponse.json({ error: "Each line needs qty > 0" }, { status: 400 })
    if (!line.unitPrice || line.unitPrice <= 0) return NextResponse.json({ error: "Each line needs unitPrice > 0" }, { status: 400 })
  }

  // ── Credit limit check ─────────────────────────────────────────────────────
  const customer = db.prepare("SELECT name, credit_limit FROM customers WHERE id=? AND is_active=1").get(body.customerId) as
    { name: string; credit_limit: number } | undefined
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

  const newOrderValue = body.lines.reduce((sum: number, l: { qty: number; unitPrice: number }) => sum + l.qty * l.unitPrice, 0)

  const openExposure = (db.prepare(`
    SELECT COALESCE(SUM(sol.qty * sol.unit_price), 0) as total
    FROM sales_order_lines sol
    JOIN sales_orders so ON so.id = sol.order_id
    WHERE so.customer_id=? AND so.status NOT IN ('DELIVERED','CANCELLED','PAID')
  `).get(body.customerId) as { total: number }).total

  const creditCheckPassed = customer.credit_limit === 0 || (openExposure + newOrderValue) <= customer.credit_limit
  const status = creditCheckPassed ? "DRAFT" : "CREDIT_HOLD"

  db.transaction(() => {
    const count = (db.prepare("SELECT COUNT(*) as c FROM sales_orders").get() as { c: number }).c
    const orderNumber = `#${count + 1001}`

    db.prepare(`
      INSERT INTO sales_orders
        (id, order_number, customer_id, status, notes, created_by, created_at, updated_at, requested_delivery_date, credit_check_passed)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(id, orderNumber, body.customerId, status, body.notes ?? null, auth.id, now, now,
           body.requestedDeliveryDate ?? null, creditCheckPassed ? 1 : 0)

    for (const line of body.lines) {
      db.prepare("INSERT INTO sales_order_lines (order_id, product_id, qty, unit_price, gst_rate) VALUES (?,?,?,?,?)")
        .run(id, line.productId, line.qty, line.unitPrice, line.gstRate ?? null)
    }

    writeAuditLog(db, {
      userId: auth.id, action: "SO_CREATED", entityType: "sales_order", entityId: id,
      after: { customerId: body.customerId, lines: body.lines.length, newOrderValue, creditCheckPassed, status },
    })
  })()

  if (!creditCheckPassed) {
    const over = openExposure + newOrderValue - customer.credit_limit
    return NextResponse.json(
      enrichOrder(db, db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as Record<string, unknown>),
      {
        status: 201,
        headers: {
          "X-Credit-Warning": `Order placed on CREDIT_HOLD. Exposure ₹${(openExposure + newOrderValue).toFixed(0)} exceeds limit ₹${customer.credit_limit.toFixed(0)} by ₹${over.toFixed(0)}`,
        },
      }
    )
  }

  return NextResponse.json(
    enrichOrder(db, db.prepare("SELECT * FROM sales_orders WHERE id=?").get(id) as Record<string, unknown>),
    { status: 201 }
  )
}
