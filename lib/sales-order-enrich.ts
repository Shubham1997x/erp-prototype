import { getSupabase } from "./supabase"

export async function resolveSalesPerson(
  createdBy: string | null | undefined
): Promise<{ salesPersonId: string | null; salesPersonName: string }> {
  if (!createdBy) return { salesPersonId: null, salesPersonName: "—" }

  const supabase = getSupabase()

  if (createdBy.startsWith("usr-")) {
    const { data: user } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", createdBy)
      .single()
    return { salesPersonId: createdBy, salesPersonName: user?.name ?? createdBy }
  }

  const { data: byName } = await supabase
    .from("users")
    .select("id, name")
    .eq("name", createdBy)
    .single()
  if (byName) return { salesPersonId: byName.id, salesPersonName: byName.name }

  return { salesPersonId: null, salesPersonName: createdBy }
}

export async function enrichOrder(r: Record<string, unknown>) {
  const supabase = getSupabase()

  const { data: lines } = await supabase
    .from("sales_order_lines")
    .select("*, products(image_url)")
    .eq("order_id", r.id as string)

  const createdByRaw = r.created_by != null ? String(r.created_by) : ""
  const { salesPersonId, salesPersonName } = await resolveSalesPerson(createdByRaw)

  return {
    id: r.id,
    orderNumber: r.order_number,
    customerId: r.customer_id,
    status: r.status,
    notes: r.notes,
    createdBy: salesPersonId ?? createdByRaw,
    salesPersonId,
    salesPersonName,
    updatedBy: r.updated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    requestedDeliveryDate: r.requested_delivery_date,
    promisedDeliveryDate: r.promised_delivery_date,
    actualDeliveryDate: r.actual_delivery_date,
    parentOrderId: r.parent_order_id,
    revisionNumber: r.revision_number ?? 1,
    approvalStatus: r.approval_status ?? "PENDING",
    creditCheckPassed: r.credit_check_passed === 1 || r.credit_check_passed === true,
    tracking_number: r.tracking_number,
    carrier: r.carrier,
    lines: (lines ?? []).map((l: any) => ({
      id: l.id,
      productId: l.product_id,
      qty: l.qty,
      unitPrice: l.unit_price,
      gstRate: l.gst_rate ?? null,
      fulfilledQty: l.fulfilled_qty ?? 0,
      imageUrl: l.products?.image_url ?? null,
    })),
  }
}

export async function enrichOrdersBulk(rows: any[]) {
  if (!rows || rows.length === 0) return []
  
  const supabase = getSupabase()
  
  const userKeys = new Set<string>()
  rows.forEach(r => {
    if (r.created_by) userKeys.add(String(r.created_by))
  })

  // Fetch all users in one go
  const { data: users } = await supabase
    .from("users")
    .select("id, name")
    
  const userMap = new Map((users ?? []).map(u => [u.id, u.name]))
  const userByNameMap = new Map((users ?? []).map(u => [u.name, u.id]))

  // Now process each row
  return rows.map(r => {
    const createdByRaw = r.created_by != null ? String(r.created_by) : ""
    let salesPersonId = null
    let salesPersonName = createdByRaw

    if (createdByRaw.startsWith("usr-")) {
      if (userMap.has(createdByRaw)) {
        salesPersonId = createdByRaw
        salesPersonName = userMap.get(createdByRaw)!
      }
    } else if (userByNameMap.has(createdByRaw)) {
      salesPersonId = userByNameMap.get(createdByRaw)!
      salesPersonName = createdByRaw
    } else {
      salesPersonId = null
      salesPersonName = createdByRaw
    }

    return {
      id: r.id,
      orderNumber: r.order_number,
      customerId: r.customer_id,
      status: r.status,
      notes: r.notes,
      createdBy: salesPersonId ?? createdByRaw,
      salesPersonId,
      salesPersonName,
      updatedBy: r.updated_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      requestedDeliveryDate: r.requested_delivery_date,
      promisedDeliveryDate: r.promised_delivery_date,
      actualDeliveryDate: r.actual_delivery_date,
      parentOrderId: r.parent_order_id,
      revisionNumber: r.revision_number ?? 1,
      approvalStatus: r.approval_status ?? "PENDING",
      creditCheckPassed: r.credit_check_passed === 1 || r.credit_check_passed === true,
      tracking_number: r.tracking_number,
      carrier: r.carrier,
      lines: (r.lines ?? []).map((l: any) => ({
        id: l.id,
        productId: l.product_id,
        qty: l.qty,
        unitPrice: l.unit_price,
        gstRate: l.gst_rate ?? null,
        fulfilledQty: l.fulfilled_qty ?? 0,
        imageUrl: l.products?.image_url ?? null,
      })),
    }
  })
}
