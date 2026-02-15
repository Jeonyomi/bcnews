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
    <html lang="en" suppressHydrationWarning>
    <body>
      <script
        dangerouslySetInnerHTML={{
          __html: `(() => {
            try {
              const saved = localStorage.getItem('theme');
              const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (dark) document.documentElement.classList.add('dark');
              else document.documentElement.classList.remove('dark');
            } catch (_) {}
          })();`,
        }}
      />
      <SiteChrome>{children}</SiteChrome>
    </body>
    </html>
  )
}
