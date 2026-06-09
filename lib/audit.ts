import { getSupabase } from "./supabase"

export async function writeAuditLog(opts: {
  userId: string | null
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  details?: string
  ipAddress?: string
}) {
  await getSupabase()
    .from("audit_logs")
    .insert({
      user_id: opts.userId ?? "system",
      action: opts.action,
      entity_type: opts.entityType,
      entity_id: opts.entityId,
      before_state: opts.before ? JSON.stringify(opts.before) : null,
      after_state: opts.after ? JSON.stringify(opts.after) : null,
      details: opts.details ?? null,
      ip_address: opts.ipAddress ?? null,
    })
}

export async function createNotification(opts: {
  userId?: string | null
  role?: string | null
  type: string
  title: string
  message: string
  entityType?: string
  entityId?: string
}) {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  await getSupabase()
    .from("notifications")
    .insert({
      id,
      user_id: opts.userId ?? null,
      role: opts.role ?? null,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      is_read: 0,
    })
}

export async function checkReplenishment() {
  const supabase = getSupabase()
  const { data: materials } = await supabase
    .from("raw_materials")
    .select("id, name, current_stock, reserved_stock, reorder_point, supplier_id")
    .eq("is_active", 1)

  const lowStock = (materials ?? []).filter(
    (rm) => (rm.current_stock - (rm.reserved_stock ?? 0)) < rm.reorder_point
  )

  for (const rm of lowStock) {
    const { data: existing } = await supabase
      .from("replenishment_suggestions")
      .select("id")
      .eq("material_id", rm.id)
      .eq("status", "OPEN")
      .limit(1)
      .single()

    if (existing) continue

    const available = rm.current_stock - (rm.reserved_stock ?? 0)
    const suggestedQty = Math.max(rm.reorder_point * 2 - available, rm.reorder_point)
    const suggId = `repl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    await supabase.from("replenishment_suggestions").insert({
      id: suggId,
      material_id: rm.id,
      current_stock: rm.current_stock,
      reorder_point: rm.reorder_point,
      suggested_qty: suggestedQty,
      supplier_id: rm.supplier_id ?? null,
      status: "OPEN",
    })

    await createNotification({
      role: "Inventory Manager",
      type: "LOW_STOCK",
      title: `Low Stock: ${rm.name}`,
      message: `${rm.name} is below reorder point. Available: ${available}, Reorder Point: ${rm.reorder_point}. Suggested order: ${suggestedQty}.`,
      entityType: "raw_material",
      entityId: rm.id,
    })
  }
}
