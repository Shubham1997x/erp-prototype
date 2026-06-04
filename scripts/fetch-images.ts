import Database from "better-sqlite3"
import path from "path"

const DB_PATH = path.join(process.cwd(), "data", "erp.db")

// High-quality Unsplash product images
const unsplashImages = [
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop", // T-shirt
  "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop", // Shirt
  "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800&auto=format&fit=crop", // Jacket
  "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=800&auto=format&fit=crop", // Jeans
  "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop", // Black shirt
  "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop", // Basic tee
  "https://images.unsplash.com/photo-1604176354204-9268737828e4?q=80&w=800&auto=format&fit=crop", // Pants
  "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop", // Hoodie
]

async function main() {
  const db = new Database(DB_PATH)
  
  // Assign randomly to existing products
  const products = db.prepare("SELECT id FROM products").all() as { id: string }[]
  let updatedCount = 0

  const updateStmt = db.prepare("UPDATE products SET image_url = ? WHERE id = ?")

  db.transaction(() => {
    for (const prod of products) {
      const randomImage = unsplashImages[Math.floor(Math.random() * unsplashImages.length)]
      updateStmt.run(randomImage, prod.id)
      updatedCount++
    }
  })()

  console.log(`Successfully updated ${updatedCount} products with random images from Unsplash!`)
}

main().catch(console.error)
