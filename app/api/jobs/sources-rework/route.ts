import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

const DISABLE_IDS = [139, 142, 143, 144]
const ENABLE_NAMES = [
  'CoinDesk',
  'Cointelegraph',
  'The Block',
  'Tokenpost',
  'Blockmedia',
  'Binance Announcements',
  'Upbit Announcements',
  'Bithumb Announcements',
  'Coinone Announcements',
]

const checkSecret = (req: Request) => {
  const expected = process.env.BCNEWS_CRON_SECRET || process.env.CRON_SECRET || ''
  if (!expected) return true
  const got = req.headers.get('x-cron-secret') || ''
  return got === expected
}

export async function POST(req: Request) {
  try {
    if (!checkSecret(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const db = createSupabaseServerClient()

    const d1 = await db.from('sources').update({ enabled: false }).in('id', DISABLE_IDS)
    if (d1.error) throw d1.error

    const d2 = await db.from('sources').update({ enabled: true }).in('name', ENABLE_NAMES)
    if (d2.error) throw d2.error

    const q = await db
      .from('sources')
      .select('id,name,enabled,type,tier,region')
      .or('id.in.(139,142,143,144),name.in.(CoinDesk,Cointelegraph,The Block,Tokenpost,Blockmedia,Binance Announcements,Upbit Announcements,Bithumb Announcements,Coinone Announcements)')
      .order('id', { ascending: true })

    if (q.error) throw q.error

    const enabledCount = await db.from('sources').select('id', { count: 'exact', head: true }).eq('enabled', true)

    return NextResponse.json({
      ok: true,
      data: q.data || [],
      debug: {
        vercel_env: process.env.VERCEL_ENV || null,
        commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        supabase_url_host: (() => {
          try {
            return new URL(process.env.SUPABASE_URL || '').host || null
          } catch {
            return null
          }
        })(),
        enabled_true_count: enabledCount.count || 0,
        tracked_enabled_flags: (q.data || [])
          .filter((s: any) => [139, 142, 143, 144].includes(Number(s.id)))
          .map((s: any) => ({ id: s.id, name: s.name, enabled: s.enabled })),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
