import type { Metadata } from 'next'
import './globals.css'
import SiteChrome from '@/components/SiteChrome'

export const metadata: Metadata = {
  title: 'Stablecoin News Dashboard',
  description: 'Daily stablecoin and crypto news updates',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
    <body>
      <SiteChrome>{children}</SiteChrome>
    </body>
    </html>
  )
}
