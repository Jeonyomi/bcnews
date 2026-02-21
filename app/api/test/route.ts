import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // no caching

export async function GET() {
  const { createHash } = await import('node:crypto')
  const cronSecret = process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET || ''
  const fp = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 10)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // IMPORTANT: do not require env vars at module-load time; it breaks Vercel builds.
  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({
      env: {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnon,
        url: supabaseUrl || null,
        cronSecretLen: cronSecret.length,
        cronSecretFp: fp(cronSecret),
      },
      items: [],
      serverTime: new Date().toISOString(),
      warning: 'Missing NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY at runtime.',
    })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnon)

    const { data: items, error } = await supabase
      .from('news_briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) throw error

    return NextResponse.json({
      env: {
        hasUrl: true,
        hasKey: true,
        url: supabaseUrl,
        cronSecretLen: cronSecret.length,
        cronSecretFp: fp(cronSecret),
      },
      items,
      serverTime: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        env: {
          hasUrl: true,
          hasKey: true,
          url: supabaseUrl,
          cronSecretLen: cronSecret.length,
          cronSecretFp: fp(cronSecret),
        },
        error: String(error),
      },
      { status: 500 },
    )
  }
}