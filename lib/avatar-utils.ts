export function getAvatarUrl(seed: string | number) {
  return `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/100/100`
}

export function getCompanyImageUrl(seed: string | number) {
  return `https://picsum.photos/seed/company-${encodeURIComponent(String(seed))}/100/100`
}
