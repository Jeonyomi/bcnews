import type { Metadata } from 'next'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}
