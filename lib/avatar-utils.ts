// Curated professional male portrait photos from Unsplash
const PROFESSIONAL_PORTRAITS = [
  "1472099645785-5658abf4ff4e",
  "1519085360753-af0119f7cbe7",
  "1507003211169-0a1dd7228f2d",
  "1500648767791-00dcc994a43e",
  "1506794778202-cad84cf45f1d",
  "1463453091185-61582044d556",
  "1568602471122-7832951cc4c5",
  "1570295999919-56ceb5ecca61",
  "1552058544-f2b08422138a",
  "1603415526960-f7e0328c63b1",
]

function hashSeed(seed: string | number): number {
  const s = String(seed)
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return hash
}

export function getAvatarUrl(seed: string | number): string {
  const photoId = PROFESSIONAL_PORTRAITS[hashSeed(seed) % PROFESSIONAL_PORTRAITS.length]
  return `https://images.unsplash.com/photo-${photoId}?w=200&h=200&fit=crop&crop=face&auto=format`
}

// Curated building / storefront / office exterior photos from Unsplash
const COMPANY_BUILDING_PHOTOS = [
  "1556761175-b413da4baf72", // modern office building
  "1534430480872-3498386e7856", // glass office exterior
  "1497215842964-222b430dc094", // city office block
  "1504307651254-35680f356dfd", // retail storefront
  "1497366216548-37526070297c", // corporate building
  "1553877522-43269d4ea984", // warehouse exterior
  "1441986300917-64674bd600d8", // retail store interior
  "1577760258779-e787a1733016", // modern building facade
  "1540575467063-178a50c2df87", // shopping mall / retail
  "1519501025264-65ba15a82390", // office lobby / interior
]

export function getCompanyImageUrl(seed: string | number): string {
  const photoId = COMPANY_BUILDING_PHOTOS[hashSeed(seed) % COMPANY_BUILDING_PHOTOS.length]
  return `https://images.unsplash.com/photo-${photoId}?w=200&h=200&fit=crop&auto=format`
}
