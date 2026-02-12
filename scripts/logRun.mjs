import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

const RUNS_FILE = path.join(process.cwd(), 'data', 'briefs', 'runs.jsonl')

export async function logRun({
  jobId,
  region = 'KR',
  isBackup = false,
  status = 'ok',
  error = null
}) {
  const entry = {
    jobId,
    startedAt: new Date().toISOString(),
    region,
    isBackup,
    status
  }
  
  if (error) {
    entry.error = error.message || String(error)
  }

  // Ensure directory exists
  const dir = path.dirname(RUNS_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  // Append to JSONL
  fs.appendFileSync(RUNS_FILE, JSON.stringify(entry) + '\n', 'utf8')
  
  return entry
}

// CLI support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,,jobId, status='ok'] = process.argv
  if (!jobId) {
    console.error('Usage: node logRun.mjs <jobId> [status]')
    process.exit(1)
  }
  
  const entry = await logRun({ jobId, status })
  console.log('Logged run:', entry)
}