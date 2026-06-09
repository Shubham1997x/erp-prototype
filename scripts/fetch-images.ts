/**
 * One-off script to assign random Unsplash images to products in Supabase.
 * Run: npx tsx scripts/fetch-images.ts
 */
import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const unsplashImages = [
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1604176354204-9268737828e4?q=80&w=800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop",
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const { data: products } = await supabase.from("products").select("id")

  let updatedCount = 0
  for (const prod of products ?? []) {
    const randomImage = unsplashImages[Math.floor(Math.random() * unsplashImages.length)]
    await supabase.from("products").update({ image_url: randomImage }).eq("id", prod.id)
    updatedCount++
  }

  console.log(`Updated ${updatedCount} products with random Unsplash images.`)
}

main().catch(console.error)
