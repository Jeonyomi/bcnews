import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// NOTE: Full KO translation is produced by transformer.ts (dictionary-based).
// In this route we primarily:
// - fetch rows
// - return safe empty list if DB/table isn't initialized (common on fresh Vercel deploy)

export async function GET() {
  try {
    const news = await prisma.newsItem.findMany({
      where: {
        NOT: {
          OR: [{ title: { contains: 'TEST' } }, { source: 'local-test' }]
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Keep API response format stable for the UI.
    const items = news.map((item) => ({
      ...item,
      title: item.title.replaceAll('??', ''),
      body: {
        en: item.body,
        // For now: server-side KO translation is handled in a dedicated transformer.
        // If you want to call it here, we can wire it in; keeping this minimal avoids extra coupling.
        ko: item.body
      }
    }))

    return NextResponse.json({ items })
  } catch (err: any) {
    // Prisma error P2021: table does not exist
    if (err?.code === 'P2021') {
      return NextResponse.json({ items: [] })
    }

    console.error('Failed to fetch news:', err)
    return NextResponse.json({ items: [], error: 'Internal Server Error' }, { status: 500 })
  }
}
