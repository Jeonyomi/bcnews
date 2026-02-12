import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'  // Disable caching
export const runtime = 'edge'  // Use edge runtime for better performance

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

    // Set proper UTF-8 BOM header for Korean characters
    const utf8Encoder = new TextEncoder()
    const jsonString = JSON.stringify({ items })
    const utf8Data = utf8Encoder.encode('\uFEFF' + jsonString)  // Add BOM

    return new Response(utf8Data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Language': 'ko-KR, en-US',
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