'use client'

import { useEffect, useState } from 'react'

export default function TestPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        // Add cache-busting parameter
        const res = await fetch(`/api/news?t=${Date.now()}`)
        const json = await res.json()

        // Try to decode Base64 content
        const decodedItems = json.items.map((item: any) => ({
          ...item,
          content: atob(item.content)
        }))

        setData({ ...json, items: decodedItems })
      } catch (e) {
        console.error('Error:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Test Page</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Environment</h2>
        <div className="bg-gray-100 p-4 rounded-lg dark:bg-gray-800 dark:text-gray-300">
          <div>NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL}</div>
          <div>Has NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'yes' : 'no'}</div>
        </div>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : data ? (
        <div>
          <h2 className="text-xl font-semibold mb-2">Latest News</h2>
          <div className="bg-gray-100 p-4 rounded-lg dark:bg-gray-800 dark:text-gray-300">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div>No data</div>
      )}
    </div>
  )
}