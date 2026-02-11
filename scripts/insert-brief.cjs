const fs = require('fs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const body = fs.readFileSync('tmp/brief-en-2026-02-11.md', 'utf8')
  const title = 'Stablecoin / Crypto News Brief (EN) — 2026-02-11'
  const source = 'cron-manual'

  await prisma.newsItem.create({
    data: { title, body, source }
  })

  console.log('DB insert: ok')
}

main()
  .catch((e) => {
    console.error('DB insert: failed', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
