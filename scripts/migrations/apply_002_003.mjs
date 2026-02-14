import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'

const DB_URL = process.env.DATABASE_URL

if (!DB_URL) throw new Error('Missing env DATABASE_URL')

const fileMap = {
  '002_issue_first_schema.sql': path.join(process.cwd(), 'migrations', '002_issue_first_schema.sql'),
  '003_issue_first_constraints.sql': path.join(process.cwd(), 'migrations', '003_issue_first_constraints.sql'),
}

async function main() {
  const db = postgres(DB_URL, {
    ssl: 'require',
    max: 1,
  })

  try {
    for (const file of Object.keys(fileMap)) {
      console.log(`Applying ${file}`)
      const sql = fs.readFileSync(fileMap[file], 'utf8')
      await db.unsafe(sql)
      console.log(`Applied ${file}`)
    }

    console.log('Migrations 002+ complete')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main().catch(console.error)
