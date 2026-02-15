import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { err, ok } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const client = createAdminClient()
    const { data: sources, error } = await client.from('sources').select('*').order('id', { ascending: true })
    if (error) throw error

    const { data: logs } = await client
      .from('ingest_logs')
      .select('source_id,status,run_at_utc,items_fetched,items_saved,error_message')
      .order('run_at_utc', { ascending: false })

    const grouped: Record<number, any[]> = {}
    for (const row of logs || []) {
      if (!row.source_id) continue
      if (!grouped[row.source_id]) grouped[row.source_id] = []
      grouped[row.source_id].push(row)
    }

    const health = (sources || []).map((source) => {
      const sourceLogs = grouped[source.id] || []
      const latest = sourceLogs[0]
      const status = source.enabled === false
        ? 'disabled'
        : latest?.status === 'ok'
          ? 'ok'
          : latest?.status === 'error'
            ? 'down'
            : 'warn'

      return {
        source_id: source.id,
        source_name: source.name,
        status,
        last_status: latest ? latest.status : null,
        last_items: latest ? latest.items_fetched : 0,
        last_error: source.enabled === false ? null : latest?.error_message || null,
        last_run_at: latest ? latest.run_at_utc : null,
      }
    })

    return NextResponse.json(
      ok({
        sources,
        health,
      }),
    )
  } catch (error) {
    console.error('GET /api/sources failed', error)
    return NextResponse.json(err(`sources_error: ${String(error)}`), { status: 500 })
  }
}
