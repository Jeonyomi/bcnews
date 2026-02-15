import { useEffect } from 'react'

type RefreshBarProps = {
  label?: string
  lastUpdatedAt: string
  isAutoRefreshOn: boolean
  onToggleAutoRefresh: (enabled: boolean) => void
  onRefresh: () => void | Promise<void>
}

export default function RefreshBar({
  label = 'Last updated',
  lastUpdatedAt,
  isAutoRefreshOn,
  onToggleAutoRefresh,
  onRefresh,
}: RefreshBarProps) {
  useEffect(() => {
    if (!isAutoRefreshOn) return

    const timer = window.setInterval(() => {
      void onRefresh()
    }, 5 * 60 * 1000)

    return () => window.clearInterval(timer)
  }, [isAutoRefreshOn, onRefresh])

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}: </span>
        <span>{lastUpdatedAt || 'Not updated yet'}</span>
        <span className="text-gray-400">(Auto-refresh: {isAutoRefreshOn ? 'ON' : 'OFF'})</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={isAutoRefreshOn}
            onChange={(e) => onToggleAutoRefresh(e.target.checked)}
            className="h-4 w-4"
          />
          Auto-refresh
        </label>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded bg-gray-900 px-3 py-1.5 text-xs text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
