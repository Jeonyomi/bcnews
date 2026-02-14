'use client'

import { useEffect, useState } from 'react'

export default function SourcesPage() {
  const [sources, setSources] = useState<any[]>([])
  const [health, setHealth] = useState<any[]>([])

  useEffect(() => {
    const run = async () => {
      const response = await fetch('/api/sources')
      const payload = await response.json()
      if (payload.ok) {
        setSources(payload.data.sources || [])
        setHealth(payload.data.health || [])
      }
    }
    run()
  }, [])

  const healthMap = new Map<number, any>(health.map((row) => [row.source_id, row]))

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Sources</h1>
      <p className="text-sm text-gray-500">Source tier, health, ingest failures and latest success/error state.</p>

      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Region</th>
              <th className="px-3 py-2 text-left">Tier</th>
              <th className="px-3 py-2 text-left">Health</th>
              <th className="px-3 py-2 text-left">Last run</th>
              <th className="px-3 py-2 text-left">Fetched</th>
              <th className="px-3 py-2 text-left">Error</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const healthRow = healthMap.get(source.id) || {}
              return (
                <tr key={source.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">{source.name}</td>
                  <td className="px-3 py-2">{source.type}</td>
                  <td className="px-3 py-2">{source.region || 'All'}</td>
                  <td className="px-3 py-2">{source.tier || '-'}</td>
                  <td className="px-3 py-2">{healthRow.status || 'warn'}</td>
                  <td className="px-3 py-2">{healthRow.last_run_at || '-'}</td>
                  <td className="px-3 py-2">{healthRow.last_items || 0}</td>
                  <td className="px-3 py-2 text-xs text-red-500">{healthRow.last_error || '-'}</td>
                </tr>
              )
            })}
            {sources.length === 0 ? (
              <tr>
                <td className="px-3 py-2 text-sm text-gray-500" colSpan={8}>
                  No sources configured.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
