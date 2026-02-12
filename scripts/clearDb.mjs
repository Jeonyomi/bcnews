import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { error } = await supabase
    .from('news_briefs')
    .delete()
    .neq('id', 0)  // Delete all rows

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }

  console.log('Database cleared')
}

main().catch(console.error)