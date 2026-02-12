'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function TestPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<any>(null)

  useEffect(() => {
    // 1. 직접 Supabase 호출
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    async function fetchDirect() {
      try {
        const { data, error } = await supabase
          .from('news_briefs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) throw error
        setData({ direct: data })
      } catch (e) {
        setError({ direct: e })
        console.error('Direct fetch error:', e)
      }
    }

    // 2. API 라우트 호출
    async function fetchApi() {
      try {
        const res = await fetch('/api/news')
        const json = await res.json()
        setData(prev => ({ ...prev, api: json }))
      } catch (e) {
        setError(prev => ({ ...prev, api: e }))
        console.error('API fetch error:', e)
      }
    }

    fetchDirect()
    fetchApi()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Test Page</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Environment</h2>
        <div className="bg-gray-100 p-4 rounded-lg">
          <div>NEXT_PUBLIC_SUPABASE_URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set'}</div>
          <div>Has NEXT_PUBLIC_SUPABASE_ANON_KEY: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'yes' : 'no'}</div>
        </div>
      </div>

      {error && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-2 text-red-600">Errors</h2>
          <div className="bg-red-50 p-4 rounded-lg">
            <pre>{JSON.stringify(error, null, 2)}</pre>
          </div>
        </div>
      )}

      {data && (
        <div>
          <h2 className="text-xl font-semibold mb-2">Data</h2>
          <div className="bg-gray-100 p-4 rounded-lg">
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}