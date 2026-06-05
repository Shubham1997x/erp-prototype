import { Geist_Mono, Inter, Manrope, Roboto, JetBrains_Mono, Instrument_Sans } from "next/font/google"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const jetbrainsMonoHeading = JetBrains_Mono({subsets:['latin'],variable:'--font-heading'})
const inter = Inter({subsets:['latin'],variable:'--font-sans'})
const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'})

export const metadata = {
  title: "ShirtCo ERP",
  description: "Manufacturing ERP for shirt production — Sales, Inventory, BOM, Production, MES, Shipments",
}

import { TooltipProvider } from "@/components/ui/tooltip"

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", jetbrainsMonoHeading.variable, inter.variable, jetbrainsMono.variable, "font-sans")}
    >
      <body suppressHydrationWarning>
        <TooltipProvider>
          {children}
          <Toaster richColors position="bottom-right" expand={false} />
        </TooltipProvider>
      </body>
    </html>
  )
}
