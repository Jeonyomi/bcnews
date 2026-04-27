import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import {
  fetchOccApplicants,
  getOccApplicantState,
  queueOccApplicantPost,
  writeOccApplicantState,
  type OccApplicantRow,
} from '@/lib/occApplicantPosting'

export const dynamic = 'force-dynamic'

const getSecret = () =>
  process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET

export async function POST(request: Request) {
  try {
    const secret = getSecret()
    const header = request.headers.get('x-cron-secret')
    if (!secret || !header || header !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const client = createSupabaseServerClient()
    const fetched = await fetchOccApplicants()
    const state = await getOccApplicantState(client)
    const previous = new Map<string, OccApplicantRow>((state?.knownApplicants || []).map((row: OccApplicantRow) => [row.dedupeKey, row]))
    const current = new Map<string, OccApplicantRow>(fetched.applicants.map((row: OccApplicantRow) => [row.dedupeKey, row]))

    if (!state) {
      await writeOccApplicantState(client, {
        runAtUtc: fetched.fetchedAt,
        knownApplicants: fetched.applicants,
        note: 'baseline_initialized',
      })

      return NextResponse.json({
        ok: true,
        initialized: true,
        queued: 0,
        added_count: 0,
        current_count: fetched.applicants.length,
        note: 'baseline_initialized_no_post',
      })
    }

    const added = fetched.applicants.filter((row) => !previous.has(row.dedupeKey))
    const queued: Array<{ applicant: string; dateReceivedIso: string; dedupeKey: string; queued: boolean; reason: string }> = []

    for (const row of added) {
      const result = await queueOccApplicantPost(client, row)
      queued.push({
        applicant: row.applicant,
        dateReceivedIso: row.dateReceivedIso,
        dedupeKey: row.dedupeKey,
        queued: result.queued,
        reason: result.reason,
      })
    }

    await writeOccApplicantState(client, {
      runAtUtc: fetched.fetchedAt,
      knownApplicants: Array.from(current.values()),
      note: added.length > 0 ? 'state_advanced_with_additions' : 'state_advanced_no_change',
    })

    return NextResponse.json({
      ok: true,
      initialized: false,
      queued: queued.filter((item) => item.queued).length,
      added_count: added.length,
      current_count: fetched.applicants.length,
      items: queued,
    })
  } catch (error) {
    console.error('POST /api/jobs/occ-applicants failed', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
