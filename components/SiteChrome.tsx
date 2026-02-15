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
          <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">bcnews</div>
            <nav className="flex gap-2 overflow-x-auto pb-1">
              {NAV.map((item) => {
                const active = pathname?.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
                      active
                        ? 'bg-gray-900 text-white shadow-sm dark:bg-gray-100 dark:text-gray-900'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
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

        <main className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
