import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'  // Disable caching
export const runtime = 'edge'  // Use edge runtime for better performance

// IMPORTANT: Use only public envs for the UI endpoint.
// This avoids accidentally connecting with a different service_role-backed project.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC Supabase config for /api/news', {
    hasPublicUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasPublicAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })
}

const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '')

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

    return new Response(JSON.stringify({ items }), {
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
      {
        error: String(error),
        config: {
          hasUrl: !!supabaseUrl,
          hasPublicAnonKey: !!supabaseKey
        }
      },
      { status: 500 }
    )
  }
}
