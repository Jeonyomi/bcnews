const express = require('express')
const { transformNewsContent } = require('./transformer')
const { newsItems } = require('./storage')

const router = express.Router()

router.get('/v1/news', async (req, res) => {
  try {
    // Transform to localized content
    const items = newsItems.map(item => transformNewsContent(item))
    res.json({ items })
  } catch (error) {
    console.error('Failed to fetch news:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/v1/news/:id', async (req, res) => {
  const { id } = req.params

  try {
    const item = newsItems.find(item => item.id === id)

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

// Add a test news item
newsItems.push({
  id: 'test-1',
  title: 'Stablecoin / Crypto News Brief (EN) 2026-02-11',
  body: `[KR]
1) Korea FSS targets crypto market manipulation; starts Digital Asset Basic Act prep (incl. stablecoins)
- Summary: Korea's Financial Supervisory Service (FSS) said it will run planned investigations into high-risk crypto market misconduct (e.g., manipulation tactics and misinformation) and develop AI-assisted detection. It also said it has formed a prep team for the upcoming "Digital Asset Basic Act," including building disclosure standards and licensing review manuals for digital-asset businesses and stablecoin issuers.
- Why it matters: Korea is moving from reactive enforcement to systemized supervision—especially relevant for exchange integrity and any KRW-linked stablecoin regime.
- Link: https://www.yna.co.kr/view/AKR20260209030100002

[Global]
1) Deel + MoonPay partner to enable stablecoin salary payouts (UK/EU first, US later)
- Summary: Deel and MoonPay announced a partnership to support compliant salary payments in stablecoins to users' non-custodial wallets, with rollout starting next month in the UK/EU and a second phase planned for the US. The announcement frames stablecoin payroll as faster settlement and broader accessibility for workers across borders.
- Why it matters: Payroll is a "sticky" distribution channel—if stablecoin payouts become mainstream in HR/payroll stacks, it materially increases real-world stablecoin velocity and demand.

[One-liner]
Latest developments show increasing institutional adoption of stablecoins, particularly in payroll and cross-border payments, while regulators continue to build frameworks for oversight.`,
  source: 'cron',
  createdAt: new Date(),
  updatedAt: new Date()
})

module.exports = router