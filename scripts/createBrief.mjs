import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { fileURLToPath } from 'url'
import { logRun } from './logRun.mjs'

const BRIEFS_DIR = path.join(process.cwd(), 'data', 'briefs')

function formatKst(date) {
  return date.toISOString().replace('Z', '+09:00')
}

export async function createBrief({
  content,
  region = 'KR',
  source = 'main',
  isBackup = false,
  topics = [],
  score = null,
  windowHours = 12
} = {}) {
  if (!content) throw new Error('content is required')
  
  // Create window (KST)
  const now = new Date()
  const startKst = new Date(now.getTime() - (windowHours * 60 * 60 * 1000))
  
  // Format frontmatter
  const meta = {
    region,
    source,
    startKst: formatKst(startKst),
    endKst: formatKst(now),
    isBackup
  }
  
  if (topics.length > 0) meta.topics = topics
  if (score !== null) meta.score = score
  
  const frontmatter = yaml.dump(meta)
  
  // Combine into full document
  const document = [
    '---',
    frontmatter.trim(),
    '---',
    '',
    content.trim(),
    ''
  ].join('\n')
  
  // Generate filename
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '')
    .replace('T', '-')
  
  const filename = `${source}-${timestamp}.md`
  const fullPath = path.join(BRIEFS_DIR, filename)
  
  // Ensure directory exists
  if (!fs.existsSync(BRIEFS_DIR)) {
    fs.mkdirSync(BRIEFS_DIR, { recursive: true })
  }
  
  // Write file
  fs.writeFileSync(fullPath, document, 'utf8')
  
  // Log the run
  await logRun({
    jobId: `news-brief-${region.toLowerCase()}-${source}`,
    region,
    isBackup,
    status: 'ok'
  })
  
  return {
    path: fullPath,
    meta
  }
}

// CLI support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,,inputFile, region='KR', source='main'] = process.argv
  if (!inputFile) {
    console.error('Usage: node createBrief.mjs <inputFile> [region] [source]')
    process.exit(1)
  }
  
  const content = fs.readFileSync(inputFile, 'utf8')
  const result = await createBrief({ content, region, source })
  console.log('Created brief:', result)
}