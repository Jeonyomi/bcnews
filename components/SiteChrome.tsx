"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import RefreshBar from '@/components/RefreshBar'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/issues', label: 'Issues' },
  { href: '/articles', label: 'Articles' },
  { href: '/search', label: 'Search' },
  { href: '/sources', label: 'Sources' },
]

const REFRESH_REQUEST_EVENT = 'bcnews:refresh-request'
const REFRESH_DONE_EVENT = 'bcnews:refresh-done'

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const navItems = useMemo(() => NAV, [])

  const requestRefresh = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent(REFRESH_REQUEST_EVENT, {
        detail: {
          pathname,
        },
      }),
    )
  }, [pathname])

  const handleRefreshDone = useCallback((event: Event) => {
    const custom = event as CustomEvent<{ pathname: string; lastUpdatedAt?: string }>
    if (!custom.detail || custom.detail.pathname !== pathname) return
    setLastUpdatedAt(custom.detail.lastUpdatedAt || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.dispatchEvent(
      new CustomEvent(REFRESH_REQUEST_EVENT, {
        detail: {
          pathname,
        },
      }),
    )

    window.addEventListener(REFRESH_DONE_EVENT, handleRefreshDone)
    return () => window.removeEventListener(REFRESH_DONE_EVENT, handleRefreshDone)
  }, [pathname, requestRefresh, handleRefreshDone])

  const closeMenu = () => setOpen(false)

  useEffect(() => {
    if (!autoRefresh) return

    const timer = window.setInterval(() => {
      requestRefresh()
    }, 60 * 1000)

    return () => window.clearInterval(timer)
  }, [autoRefresh, requestRefresh])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-black dark:text-gray-100">
      <div className="relative mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:px-6">
        <div className="w-full md:hidden">
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-gray-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
            <div className="flex items-center justify-between gap-2">
              <div className="select-none text-sm font-black uppercase tracking-[0.22em] text-gray-900 dark:text-gray-100">
                <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent dark:from-sky-400 dark:via-indigo-400 dark:to-violet-400">
                  bcnews
                </span>
              </div>
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
            <div className="px-2 pb-3 select-none text-base font-black uppercase tracking-[0.24em] text-gray-900 dark:text-gray-100">
              <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 bg-clip-text text-transparent dark:from-sky-400 dark:via-indigo-400 dark:to-violet-400">
                bcnews
              </span>
            </div>
            <div className="px-2 pb-3">
              <RefreshBar
                label="Menu control"
                lastUpdatedAt={lastUpdatedAt || 'Not updated yet'}
                isAutoRefreshOn={autoRefresh}
                onToggleAutoRefresh={setAutoRefresh}
                onRefresh={requestRefresh}
              />
              <div className="mt-2 flex justify-end">
                <ThemeToggle />
              </div>
            </div>
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
          <div className="px-3 pb-3 text-sm font-semibold text-gray-400">Menu</div>
          <div className="px-2 pb-3">
            <RefreshBar
              label="Menu control"
              lastUpdatedAt={lastUpdatedAt || 'Not updated yet'}
              isAutoRefreshOn={autoRefresh}
              onToggleAutoRefresh={setAutoRefresh}
              onRefresh={requestRefresh}
            />
            <div className="mt-2 flex justify-end pr-1">
              <ThemeToggle />
            </div>
          </div>
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
              )}
            )}
          </nav>
        </aside>
      </div>
    </div>
  )
}

