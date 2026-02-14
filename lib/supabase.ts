import { createClient } from '@supabase/supabase-js'

const getEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return value
  }
  return undefined
}

export const createPublicClient = () => {
  const supabaseUrl = getEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  const supabaseAnon = getEnv([
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error('Missing Supabase public env vars')
  }

  return createClient(supabaseUrl, supabaseAnon)
}

export const createAdminClient = () => {
  const supabaseUrl = getEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])
  const supabaseKey = getEnv([
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  ])

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase env vars for server writes')
  }

  return createClient(supabaseUrl, supabaseKey)
}

export const parseJsonArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item))
    } catch {
      return []
    }
  }
  return []
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

export const toKstDateTime = (value: string) => {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export const toUtcNow = () => new Date().toISOString()

export const timeWindowToIso = (window: '6h' | '12h' | '24h' | '7d' | 'all' = '24h') => {
  if (window === 'all') return null
  const now = new Date()
  if (window === '6h') now.setHours(now.getHours() - 6)
  if (window === '12h') now.setHours(now.getHours() - 12)
  if (window === '24h') now.setHours(now.getHours() - 24)
  if (window === '7d') now.setDate(now.getDate() - 7)
  return now.toISOString()
}

export const sanitizeSqlText = (value: string) => value.trim()
