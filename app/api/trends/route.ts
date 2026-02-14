import { NextResponse } from 'next/server'
import { createPublicClient, parseJsonArray, timeWindowToIso } from '@/lib/supabase'
import { err, ok, parseTimeWindow, type TimeWindow } from '@/lib/dashboardApi'

export const dynamic = 'force-dynamic'

const makeCounter = () => new Map<string, number>()

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const window = parseTimeWindow(url.searchParams.get('time_window'))
    const region = (url.searchParams.get('region') || 'All') as 'All' | 'KR' | 'Global'
    const limit = Math.min(20, Math.max(5, Number(url.searchParams.get('limit') || '10')))

    const since = timeWindowToIso(window)
    const client = createPublicClient()

    let query = client.from('issues').select('topic_label,key_entities,importance_score')
    if (since) query = query.gte('last_seen_at_utc', since)
    if (region !== 'All') query = query.eq('region', region)

    const { data, error } = await query
    if (error) throw error

    const topicCounter = makeCounter()
    const entityCounter = makeCounter()

    for (const issue of data || []) {
      if (issue.topic_label) {
        topicCounter.set(issue.topic_label, (topicCounter.get(issue.topic_label) || 0) + 1)
      }

      const entities = parseJsonArray((issue as any).key_entities)
      for (const entity of entities.slice(0, 3)) {
        const normalized = String(entity).trim()
        if (!normalized) continue
        entityCounter.set(normalized, (entityCounter.get(normalized) || 0) + 1)
      }
    }

    const topics = Array.from(topicCounter.entries())
      .map(([name, score]) => ({ name, score, bucket: 'topic' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const entities = Array.from(entityCounter.entries())
      .map(([name, score]) => ({ name, score, bucket: 'entity' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return NextResponse.json(ok({ topics, entities, window }))
  } catch (error) {
    console.error('GET /api/trends failed', error)
    return NextResponse.json(err(`trends_error: ${String(error)}`), { status: 500 })
  }
}
