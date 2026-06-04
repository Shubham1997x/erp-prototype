import { Geist_Mono, Inter, Manrope, Roboto, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const manrope = Manrope({ subsets: ["latin"], variable: "--font-heading" })
const roboto = Roboto({subsets:['latin'],variable:'--font-sans'})
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
      className={cn("antialiased", manrope.variable, roboto.variable, "font-mono", jetbrainsMono.variable)}
    >
      <body>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
