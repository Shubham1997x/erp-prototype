/**
 * Seed the Supabase database with demo data.
 * Run once after setting up the schema:
 *   npx tsx scripts/seed-supabase.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"
import { customers, products, users, salesOrders } from "../lib/seed"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("❌  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function seed() {
  console.log("🌱  Seeding Supabase…")

  // Users
  const { error: usersErr } = await supabase.from("users").upsert(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      last_login: u.lastLogin,
      password_hash: u.passwordHash ?? null,
    })),
    { onConflict: "id" }
  )
  if (usersErr) throw usersErr
  console.log(`  ✓  ${users.length} users`)

  // Customers
  const { error: custErr } = await supabase.from("customers").upsert(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      contact: c.contact,
      email: c.email,
      address: c.address,
      credit_limit: c.creditLimit,
      payment_terms: c.paymentTerms,
    })),
    { onConflict: "id" }
  )
  if (custErr) throw custErr
  console.log(`  ✓  ${customers.length} customers`)

  // Products
  const { error: prodErr } = await supabase.from("products").upsert(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit_of_measure: p.unitOfMeasure,
      price: p.price,
      bom_id: (p as any).bomId ?? null,
      current_stock: p.currentStock,
      reserved_stock: p.reservedStock,
      image_url: (p as any).imageUrl ?? null,
      category: (p as any).category ?? null,
      unit_cost: (p as any).unitCost ?? 0,
    })),
    { onConflict: "id" }
  )
  if (prodErr) throw prodErr
  console.log(`  ✓  ${products.length} products`)

  // Sales orders + lines
  let orderSeq = 1001
  for (const so of salesOrders) {
    const { error: soErr } = await supabase.from("sales_orders").upsert(
      {
        id: so.id,
        order_number: `#${orderSeq++}`,
        customer_id: so.customerId,
        status: so.status,
        created_by: so.createdBy,
        created_at: so.createdAt,
        updated_at: so.updatedAt,
      },
      { onConflict: "id" }
    )
    if (soErr) throw soErr

    // Delete existing lines then re-insert (sales_order_lines has no unique constraint on order_id+product_id)
    await supabase.from("sales_order_lines").delete().eq("order_id", so.id)
    const { error: linesErr } = await supabase.from("sales_order_lines").insert(
      so.lines.map((l) => ({
        order_id: so.id,
        product_id: l.productId,
        qty: l.qty,
        unit_price: l.unitPrice,
      }))
    )
    if (linesErr) throw linesErr
  }
  console.log(`  ✓  ${salesOrders.length} sales orders`)

  console.log("✅  Done — Supabase seeded successfully!")
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err)
  process.exit(1)
})
