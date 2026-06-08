import { Geist_Mono, Inter, Manrope, Roboto, JetBrains_Mono, Instrument_Sans, Geist, Outfit } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const outfit = Outfit({subsets:['latin'],variable:'--font-heading'})
const inter = Inter({subsets:['latin'],variable:'--font-sans'})
const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'})

export const metadata = {
  title: "ShirtCo ERP",
  icons: {
    icon: "/logo.jpg",
    shortcut: "/logo.jpg",
    apple: "/logo.jpg",
  },
  description: "Manufacturing ERP for shirt production — Sales, Inventory, BOM, Production, MES, Shipments",
}

import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", outfit.variable, inter.variable, jetbrainsMono.variable, "font-sans")}
    >
      <body suppressHydrationWarning>
        <TooltipProvider>
          {children}
          <Toaster richColors position="bottom-right" expand={false} />
        </TooltipProvider>
        <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="colorblind-protanopia">
              <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
            </filter>
            <filter id="colorblind-deuteranopia">
              <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
            </filter>
            <filter id="colorblind-tritanopia">
              <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
            </filter>
          </defs>
        </svg>
      </body>
    </html>
  )
}
