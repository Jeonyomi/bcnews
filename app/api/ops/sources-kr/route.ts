import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const KR_EXCHANGE_NAMES = ['Upbit Announcements', 'Bithumb Announcements', 'Coinone Announcements']

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const window = (url.searchParams.get('window') || '24h').toLowerCase()
    const hours = window.endsWith('h') ? Number(window.slice(0, -1)) : 24
    const since = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000).toISOString()

    const client = createAdminClient()
    const { data: sources, error: srcErr } = await client
      .from('sources')
      .select('id,name,enabled,type,tier,region')
      .in('name', KR_EXCHANGE_NAMES)
      .order('id', { ascending: true })

    if (srcErr) throw srcErr
    const ids = (sources || []).map((s: any) => s.id)

    const { data: logs, error: logsErr } = await client
      .from('ingest_logs')
      .select('id,source_id,run_at_utc,status,items_fetched,items_saved,error_message')
      .in('source_id', ids)
      .gte('run_at_utc', since)
      .order('run_at_utc', { ascending: false })
      .limit(800)
    if (logsErr) throw logsErr

    const { data: articles, error: artErr } = await client
      .from('articles')
      .select('id,source_id,title,url,published_at_utc')
      .in('source_id', ids)
      .gte('published_at_utc', since)
      .order('published_at_utc', { ascending: false })
      .limit(300)
    if (artErr) throw artErr

    const perSource: Record<string, any> = {}
    for (const s of sources || []) {
      const sLogs = (logs || []).filter((l: any) => l.source_id === s.id)
      const sArts = (articles || []).filter((a: any) => a.source_id === s.id)
      perSource[s.name] = {
        ingest_counts: {
          total: sLogs.length,
          ok: sLogs.filter((x: any) => x.status === 'ok').length,
          warn: sLogs.filter((x: any) => x.status === 'warn').length,
          error: sLogs.filter((x: any) => x.status === 'error').length,
        },
        latest_log: sLogs[0] || null,
        sample_articles: sArts.slice(0, 3),
      }
    }

    return NextResponse.json({ ok: true, data: { window: `${hours}h`, since, sources: sources || [], per_source: perSource } })
  } catch (error) {
    console.error('GET /api/ops/sources-kr failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
