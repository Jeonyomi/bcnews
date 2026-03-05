import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

const db = createClient(url, key)

const ensureEnabledNames = [
  'CoinDesk',
  'Cointelegraph',
  'The Block',
  'Tokenpost',
  'Blockmedia',
  'Binance Announcements',
]

const krNoticeSources = [
  {
    name: 'Upbit Announcements',
    type: 'official',
    tier: '1',
    region: 'KR',
    enabled: true,
    url: 'https://upbit.com/service_center/notice',
    rss_url:
      'https://news.google.com/rss/search?q=site:upbit.com/service_center/notice%20(listing%20OR%20delisting%20OR%20notice)&hl=ko&gl=KR&ceid=KR:ko',
  },
  {
    name: 'Bithumb Announcements',
    type: 'official',
    tier: '1',
    region: 'KR',
    enabled: true,
    url: 'https://www.bithumb.com/customer_support/info_notice',
    rss_url:
      'https://news.google.com/rss/search?q=site:bithumb.com/customer_support/info_notice%20(listing%20OR%20delisting%20OR%20notice)&hl=ko&gl=KR&ceid=KR:ko',
  },
  {
    name: 'Coinone Announcements',
    type: 'official',
    tier: '1',
    region: 'KR',
    enabled: true,
    url: 'https://coinone.co.kr/support/notice',
    rss_url:
      'https://news.google.com/rss/search?q=site:coinone.co.kr/support/notice%20(listing%20OR%20delisting%20OR%20notice)&hl=ko&gl=KR&ceid=KR:ko',
  },
]

const run = async () => {
  const { error: enableErr } = await db
    .from('sources')
    .update({ enabled: true })
    .in('name', ensureEnabledNames)

  if (enableErr) throw enableErr

  const { error: upsertErr } = await db
    .from('sources')
    .upsert(krNoticeSources, { onConflict: 'name' })

  if (upsertErr) throw upsertErr

  console.log('source_rework_20260305_ok')
}

run().catch((e) => {
  console.error('source_rework_20260305_failed', e)
  process.exit(1)
})
