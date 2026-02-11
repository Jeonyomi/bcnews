'use client'

import { type Locale } from '@/types'

interface LocaleToggleProps {
  value: Locale
  onChange: (locale: Locale) => void
}

export function LocaleToggle({ value, onChange }: LocaleToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('en')}
        className={`px-3 py-1.5 text-xs font-semibold ${value === 'en' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600'} dark:${value === 'en' ? 'bg-gray-900/40 text-gray-200' : 'bg-gray-950 text-gray-400'} `}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => onChange('ko')}
        className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-300 dark:border-gray-700 ${value === 'ko' ? 'bg-gray-100 text-gray-900' : 'bg-white text-gray-600'} dark:${value === 'ko' ? 'bg-gray-900/40 text-gray-200' : 'bg-gray-950 text-gray-400'} `}
      >
        KO
      </button>
    </div>
  )
}
