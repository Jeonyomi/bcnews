import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data, error } = await supabase
    .from('news_briefs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log('Current data:', JSON.stringify(data, null, 2))
}

main().catch(console.error)