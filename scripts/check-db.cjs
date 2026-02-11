const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const n = await prisma.newsItem.count()
  const latest = await prisma.newsItem.findFirst({ orderBy: { createdAt: 'desc' } })
  console.log('NewsItem count:', n)
  console.log('Latest title:', latest && latest.title)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
