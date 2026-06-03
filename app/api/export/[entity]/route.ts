import { getDb } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type CsvRow = Record<string, unknown>

function escapeCsv(value: unknown): string {
  if (value == null) return ""
  const s = String(value)
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const lines   = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(","))
  }
  return lines.join("\r\n")
}

const SUPPORTED = ["sales-orders", "purchase-orders", "inventory", "stock-movements", "invoices"] as const
type EntityType = typeof SUPPORTED[number]

function fetchRows(db: ReturnType<typeof getDb>, entity: EntityType): CsvRow[] {
  switch (entity) {
    case "sales-orders":
      return db.prepare(`
        SELECT
          so.id,
          so.status,
          c.name as customer_name,
          so.created_at,
          so.requested_delivery_date,
          so.promised_delivery_date,
          so.actual_delivery_date,
          so.notes,
          so.created_by,
          COUNT(sol.id) as line_count,
          COALESCE(SUM(sol.qty * sol.unit_price), 0) as order_value
        FROM sales_orders so
        LEFT JOIN customers c ON c.id = so.customer_id
        LEFT JOIN sales_order_lines sol ON sol.order_id = so.id
        GROUP BY so.id
        ORDER BY so.created_at DESC
      `).all() as CsvRow[]

    case "purchase-orders":
      return db.prepare(`
        SELECT
          po.id,
          po.status,
          s.name as supplier_name,
          po.created_at,
          po.expected_date,
          po.notes,
          po.created_by,
          COUNT(pol.id) as line_count,
          COALESCE(SUM(pol.qty * pol.unit_price), 0) as order_value
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN purchase_order_lines pol ON pol.order_id = po.id
        GROUP BY po.id
        ORDER BY po.created_at DESC
      `).all() as CsvRow[]

    case "inventory": {
      const rawMaterials = db.prepare(`
        SELECT
          'raw_material' as type,
          rm.id,
          rm.name,
          rm.unit as unit_of_measure,
          rm.current_stock,
          rm.reserved_stock,
          (rm.current_stock - COALESCE(rm.reserved_stock, 0)) as available_stock,
          rm.reorder_point,
          rm.unit_cost,
          (rm.current_stock * COALESCE(rm.unit_cost, 0)) as stock_value,
          CASE
            WHEN rm.current_stock <= 0 THEN 'OUT_OF_STOCK'
            WHEN (rm.current_stock - COALESCE(rm.reserved_stock,0)) <= rm.reorder_point THEN 'LOW_STOCK'
            ELSE 'OK'
          END as status,
          s.name as supplier_name
        FROM raw_materials rm
        LEFT JOIN suppliers s ON s.id = rm.supplier_id
        WHERE rm.is_active = 1
      `).all() as CsvRow[]

      const products = db.prepare(`
        SELECT
          'product' as type,
          p.id,
          p.name,
          p.unit_of_measure,
          p.current_stock,
          p.reserved_stock,
          (p.current_stock - COALESCE(p.reserved_stock, 0)) as available_stock,
          NULL as reorder_point,
          p.unit_cost,
          (p.current_stock * COALESCE(p.unit_cost, 0)) as stock_value,
          CASE WHEN p.current_stock <= 0 THEN 'OUT_OF_STOCK' ELSE 'OK' END as status,
          NULL as supplier_name
        FROM products p
        WHERE p.is_active = 1
      `).all() as CsvRow[]

      return [...rawMaterials, ...products]
    }

    case "stock-movements":
      return db.prepare(`
        SELECT
          sm.id,
          sm.entity_type,
          sm.entity_id,
          COALESCE(rm.name, p.name) as entity_name,
          sm.delta,
          sm.reason,
          sm.reference_type,
          sm.reference_id,
          sm.created_by,
          sm.created_at
        FROM stock_movements sm
        LEFT JOIN raw_materials rm ON rm.id = sm.entity_id AND sm.entity_type = 'raw_material'
        LEFT JOIN products p ON p.id = sm.entity_id AND sm.entity_type = 'product'
        ORDER BY sm.created_at DESC
      `).all() as CsvRow[]

    case "invoices":
      return db.prepare(`
        SELECT
          i.id,
          i.status,
          c.name as customer_name,
          i.issue_date,
          i.due_date,
          i.subtotal,
          i.tax_amount,
          i.total,
          i.paid_amount,
          (i.total - i.paid_amount) as balance_due,
          i.notes,
          i.created_by,
          i.created_at
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        ORDER BY i.created_at DESC
      `).all() as CsvRow[]

    default:
      return []
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params

  if (!SUPPORTED.includes(entity as EntityType)) {
    return NextResponse.json(
      { error: `Unsupported entity '${entity}'. Supported: ${SUPPORTED.join(", ")}` },
      { status: 400 }
    )
  }

  const db   = getDb()
  const rows = fetchRows(db, entity as EntityType)
  const csv  = toCsv(rows)

  const today    = new Date().toISOString().slice(0, 10)
  const filename = `${entity}-${today}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
