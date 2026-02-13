'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem('theme') as Theme | null
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(getInitialTheme())
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    window.localStorage.setItem('theme', theme)
  }, [theme])

  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
        className={`px-3 py-1.5 text-xs font-semibold transition-all ${
          theme === 'light'
            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50 dark:bg-white dark:text-gray-900 dark:ring-white/60'
            : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-900'
        }`}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
        className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-300 dark:border-gray-700 transition-all ${
          theme === 'dark'
            ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/50 dark:bg-white dark:text-gray-900 dark:ring-white/60'
            : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-400 dark:hover:bg-gray-900'
        }`}
      >
        Dark
      </button>
    </div>
  )
}
