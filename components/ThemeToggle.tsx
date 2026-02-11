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
        onClick={() => setTheme('light')}
        className={`px-3 py-1.5 text-xs font-medium ${theme === 'light' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600'} dark:${theme === 'light' ? 'bg-gray-900/40 text-gray-200' : 'bg-gray-950 text-gray-400'}`}
      >
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 dark:border-gray-700 ${theme === 'dark' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600'} dark:${theme === 'dark' ? 'bg-gray-900/40 text-gray-200' : 'bg-gray-950 text-gray-400'}`}
      >
        Dark
      </button>
    </div>
  )
}
