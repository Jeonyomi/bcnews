"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/issues', label: 'Issues' },
  { href: '/articles', label: 'Articles' },
  { href: '/search', label: 'Search' },
  { href: '/sources', label: 'Sources' },
]

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-black dark:text-gray-100">
      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-4 md:px-6">
        <div className="w-full md:hidden">
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">bcnews</div>
          </div>
        </div>

        <aside className="w-52 shrink-0 hidden md:block">
          <div className="sticky top-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="px-2 pb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">bcnews</div>
            <nav className="space-y-1">
              {NAV.map((item) => {
                const active = pathname?.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded px-2 py-2 text-sm ${
                      active
                        ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-4 pb-24 md:p-6 md:pb-6 dark:border-gray-800 dark:bg-gray-950">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-2 py-2 shadow-lg backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          {NAV.map((item) => {
            const active = pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-center text-xs font-semibold transition ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-300'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
