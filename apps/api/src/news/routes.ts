import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { transformNewsContent } from './transformer'
import type { NewsItem } from '@scod/shared'

const router = Router()
const prisma = new PrismaClient()

router.get('/v1/news', async (req, res) => {
  try {
    const news = await prisma.newsItem.findMany({
      orderBy: { createdAt: 'desc' }
    })

    // Transform to localized content
    const items: NewsItem[] = news.map(item => transformNewsContent(item))

    res.json({ items })
  } catch (error) {
    console.error('Failed to fetch news:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/v1/news/:id', async (req, res) => {
  const { id } = req.params

  try {
    const item = await prisma.newsItem.findUnique({
      where: { id }
    })

    if (!item) {
      res.status(404).json({ error: 'News item not found' })
      return
    }

    res.json({ item: transformNewsContent(item) })
  } catch (error) {
    console.error('Failed to fetch news item:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router