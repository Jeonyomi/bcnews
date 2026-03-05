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

    return NextResponse.json({ ok: true, data: q.data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
