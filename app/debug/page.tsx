'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function DebugPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<any>(null)

  useEffect(() => {
    // 환경변수 체크
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Has Key:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    async function fetchData() {
      try {
        const { data, error } = await supabase
          .from('news_briefs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) throw error
        setData(data)
      } catch (e) {
        setError(e)
        console.error('Fetch error:', e)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Debug Info</h1>
      
      <div className="mb-4">
        <h2 className="font-semibold">Environment:</h2>
        <pre className="bg-gray-100 p-2 rounded">
          {JSON.stringify({
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
            HAS_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          }, null, 2)}
        </pre>
      </div>

      {error && (
        <div className="mb-4">
          <h2 className="font-semibold text-red-500">Error:</h2>
          <pre className="bg-red-50 p-2 rounded">
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      )}

      {data && (
        <div>
          <h2 className="font-semibold">Latest Data:</h2>
          <pre className="bg-gray-100 p-2 rounded">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}