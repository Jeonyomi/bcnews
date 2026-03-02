import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const must = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required server env: ${name}`)
  return v
}

const hashPrefix = (value: string, len = 12) =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, len)

export const getSupabaseServerConfig = () => {
  const url = must('SUPABASE_URL')
  const serviceRoleKey = must('SUPABASE_SERVICE_ROLE_KEY')

  let host = ''
  try {
    host = new URL(url).host
  } catch {
    throw new Error('Invalid SUPABASE_URL')
  }

  return {
    url,
    serviceRoleKey,
    host,
    supabaseHostHash: hashPrefix(host),
    serviceRoleHashPrefix: hashPrefix(serviceRoleKey),
  }
}

export const createSupabaseServerClient = () => {
  const cfg = getSupabaseServerConfig()
  return createClient(cfg.url, cfg.serviceRoleKey)
}
