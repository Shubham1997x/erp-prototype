import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAvatarUrl(seed: string | number) {
  return `https://picsum.photos/seed/${encodeURIComponent(String(seed))}/100/100`
}
