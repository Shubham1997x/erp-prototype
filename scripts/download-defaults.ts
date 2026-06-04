import fs from "fs"
import path from "path"

const DEFAULTS_DIR = path.join(process.cwd(), "public", "defaults")

if (!fs.existsSync(DEFAULTS_DIR)) {
  fs.mkdirSync(DEFAULTS_DIR, { recursive: true })
}

const TSHIRT_URLS = [
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?q=80&w=800&auto=format&fit=crop", // White T-shirt
  "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop", // Black T-shirt
  "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop", // White Tee hanging
  "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop", // Black Tee basic
  "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop", // Red basic shirt
  "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", // Grey Shirt
  "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=800&auto=format&fit=crop", // Hoodie Grey
  "https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?q=80&w=800&auto=format&fit=crop", // White T-shirt guy
  "https://images.unsplash.com/photo-1527719327859-c6ce80353573?q=80&w=800&auto=format&fit=crop", // Blue Polo
  "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?q=80&w=800&auto=format&fit=crop"  // White shirt pile
]

async function downloadImages() {
  for (let i = 0; i < TSHIRT_URLS.length; i++) {
    const url = TSHIRT_URLS[i]
    const filename = `tshirt-${i + 1}.jpg`
    const filepath = path.join(DEFAULTS_DIR, filename)

    try {
      console.log(`Downloading ${url}...`)
      const res = await fetch(url)
      const buffer = await res.arrayBuffer()
      fs.writeFileSync(filepath, Buffer.from(buffer))
      console.log(`Saved to ${filepath}`)
    } catch (e) {
      console.error(`Failed to download ${url}:`, e)
    }
  }
}

downloadImages()
