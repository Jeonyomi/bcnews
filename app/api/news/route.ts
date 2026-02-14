import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // no caching

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const getTodayKstRange = () => {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value

  if (!year || !month || !day) {
    const fallback = new Date()
    const start = new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), fallback.getUTCDate()))
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 1)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  }

  const todayStart = new Date(`${year}-${month}-${day}T00:00:00+09:00`)
  const tomorrow = new Date(todayStart)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return {
    startIso: todayStart.toISOString(),
    endIso: tomorrow.toISOString(),
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const debug = url.searchParams.get('debug') === '1'
    const includeAll = url.searchParams.get('all') === '1'
    const limit = Number(url.searchParams.get('limit') || '50')
    const take = Number.isFinite(limit) && limit > 0 ? limit : 50

    let query = supabase
      .from('news_briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(take)

    if (!includeAll) {
      const { startIso, endIso } = getTodayKstRange()
      query = query.gte('created_at_kst', startIso).lt('created_at_kst', endIso)
    }

    const { data: items, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    const payload: Record<string, any> = { items }
    if (debug) {
      payload.debug = {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        envSource: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
          keyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            ? `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(0, 8)}...${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.slice(-6)}`
            : null,
          filter: includeAll ? 'all' : 'todayKstOnly',
        }
      }
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      {
        error: String(error),
        config: {
          hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasPublicAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
      },
      { status: 500 }
    )
  }
}
