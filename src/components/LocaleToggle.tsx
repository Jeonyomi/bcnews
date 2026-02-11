import { type Locale } from '@/types'

interface LocaleToggleProps {
  value: Locale
  onChange: (locale: Locale) => void
}

export function LocaleToggle({ value, onChange }: LocaleToggleProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="bg-white border border-gray-300 rounded px-2 py-1 text-sm"
      >
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </div>
  )
}