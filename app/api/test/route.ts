import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic' // no caching

// Public key를 사용하는 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  try {
    // Debug: 쿼리와 결과를 자세히 로깅
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    
    const { data: items, error } = await supabase
      .from('news_briefs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    // 전체 응답 구조 확인
    const { createHash } = await import('node:crypto')
    const cronSecret = process.env.X_CRON_SECRET || process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET || ''
    const fp = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex').slice(0, 10)

    return NextResponse.json({
      env: {
        hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        cronSecretLen: cronSecret.length,
        cronSecretFp: fp(cronSecret),
      },
      items,
      serverTime: new Date().toISOString()
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: String(error) }, 
      { status: 500 }
    )
  }
}