import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. Delete test entries
  await prisma.newsItem.deleteMany({
    where: {
      OR: [
        { title: { contains: 'TEST' } },
        { source: 'local-test' }
      ]
    }
  })

  // 2. Fix title with '??'
  await prisma.newsItem.updateMany({
    where: {
      title: { contains: '??' }
    },
    data: {
      title: 'Stablecoin / Crypto News Brief (EN) 2026-02-11'
    }
  })

  console.log('✅ Cleanup complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())