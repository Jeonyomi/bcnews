"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/issues', label: 'Issues' },
  { href: '/articles', label: 'Articles' },
  { href: '/search', label: 'Search' },
  { href: '/sources', label: 'Sources' },
]

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const navItems = useMemo(() => NAV, [])

  const closeMenu = () => setOpen(false)

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-black dark:text-gray-100">
      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:gap-4 md:px-6">
        <div className="w-full md:hidden">
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">bcnews</div>
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                aria-label="Open navigation menu"
                aria-expanded={open}
              >
                <span className="relative block h-4 w-5">
                  <span className="absolute inset-x-0 top-0 block h-0.5 rounded bg-current" />
                  <span className="absolute inset-x-0 top-1.5 block h-0.5 rounded bg-current" />
                  <span className="absolute inset-x-0 top-3 block h-0.5 rounded bg-current" />
                </span>
              </button>
            </div>
          </div>
        </div>

        <aside className="w-52 shrink-0 hidden md:block">
          <div className="sticky top-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="px-2 pb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">bcnews</div>
            <nav className="space-y-1">
              {navItems.map((item) => {
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

        <main className="relative flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-800 dark:bg-gray-950">
          {children}
        </main>

        {open ? <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={closeMenu} /> : null}

        <aside
          className={`fixed right-0 top-0 z-30 h-full w-72 border-l border-gray-200 bg-white py-4 shadow-xl transition-transform duration-200 dark:border-gray-800 dark:bg-gray-950 md:hidden ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="px-3 pb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Menu</div>
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const active = pathname?.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className={`block rounded px-3 py-2 text-sm ${
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
        </aside>
      </div>
    </div>
  )
}
