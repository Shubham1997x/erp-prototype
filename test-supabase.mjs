import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, key)

async function test() {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*, lines:sales_order_lines(*, products(image_url)), creator:users!sales_orders_created_by_fkey(id, name)")
    .limit(1)
  
  if (error) console.error("Error:", error.message)
  else console.log("Success:", JSON.stringify(data, null, 2))
}

test()
