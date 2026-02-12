import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('Testing with URL:', process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  
  const { data, error } = await supabase
    .from('news_briefs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log('API Response:', JSON.stringify(data, null, 2))
}

main().catch(console.error)