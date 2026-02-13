import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'  // Disable caching
export const runtime = 'edge'  // Use edge runtime for better performance

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function safeBase64Encode(str: string): string {
  if (!str) return ''
  try {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_m, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    )
  } catch (e) {
    console.error('Encoding failed:', e)
    return ''
  }
}

export async function GET() {
  try {
    const { data: items, error } = await supabase
      .from('news_briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    const encodedItems = items.map(item => ({
      ...item,
      content: safeBase64Encode(item.content)
    }))

    return new Response(JSON.stringify({ items: encodedItems }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}