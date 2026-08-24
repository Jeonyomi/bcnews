import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { SOURCE_FEED_OVERRIDES } from './sourceFeedOverrides.mjs'

dotenv.config({ path: '.env.local' })
dotenv.config()

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase server credentials')

const client = createClient(url, key)

for (const [name, patch] of Object.entries(SOURCE_FEED_OVERRIDES)) {
  const { data, error } = await client
    .from('sources')
    .update(patch)
    .eq('name', name)
    .select('id,name,url,rss_url,enabled')
    .single()

  if (error) throw new Error(`${name}: ${error.message}`)
  console.log(JSON.stringify(data))
}
