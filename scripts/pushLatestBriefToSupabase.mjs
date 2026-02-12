import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BRIEFS_DIR = path.join(process.cwd(), 'data', 'briefs')

if (!SUPABASE_URL) throw new Error('Missing env SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing env SUPABASE_SERVICE_ROLE_KEY')

function listBriefFiles() {
  if (!fs.existsSync(BRIEFS_DIR)) return []
  
  // Get all .md files
  const files = fs.readdirSync(BRIEFS_DIR)
    .filter(n => n.toLowerCase().endsWith('.md'))
    .filter(n => !n.startsWith('_'))  // Exclude temp files
    
  // Sort by created time desc
  const fullPaths = files.map(f => ({
    path: path.join(BRIEFS_DIR, f),
    mtime: fs.statSync(path.join(BRIEFS_DIR, f)).mtime
  }))
  
  fullPaths.sort((a, b) => b.mtime - a.mtime)
  
  return fullPaths.map(f => f.path)
}

function parseMarkdownWithFrontmatter(content) {
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!frontMatterMatch) {
    console.log('No frontmatter found')
    return {
      meta: {},
      content: content.trim()
    }
  }

  try {
    const meta = yaml.load(frontMatterMatch[1]) || {}
    console.log('Parsed meta:', meta)  // Debug log
    return {
      meta,
      content: frontMatterMatch[2].trim()
    }
  } catch (e) {
    console.warn('Failed to parse YAML frontmatter:', e)
    return {
      meta: {},
      content: content.trim()
    }
  }
}

async function pushLatestBrief() {
  const files = listBriefFiles()
  if (files.length === 0) {
    console.log('No brief files found under', BRIEFS_DIR)
    process.exit(0)
  }

  const fullPath = files[0]  // Most recent file
  console.log('Processing file:', fullPath)  // Debug log
  
  const content = fs.readFileSync(fullPath, 'utf8')
  const { meta, content: cleanContent } = parseMarkdownWithFrontmatter(content)
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const title = meta.region === 'Global' 
    ? 'Global Digital Asset & Stablecoin Brief'
    : 'Digital Asset & Stablecoin Regulatory Brief'

  const data = {
    title,
    content: cleanContent,
    created_at: meta.startKst || new Date().toISOString(),
    region: meta.region || 'KR',
    source: meta.source || 'main',
    topics: meta.topics || [],
    score: meta.score || null
  }

  console.log('Inserting data:', data)  // Debug log

  const { data: result, error } = await supabase
    .from('news_briefs')
    .insert([data])
    .select('id, created_at, region, source, topics, score')
    .single()

  if (error) {
    console.error('Supabase insert failed:', error)
    process.exit(1)
  }

  console.log('OK inserted:', result)
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  pushLatestBrief().catch(console.error)
}