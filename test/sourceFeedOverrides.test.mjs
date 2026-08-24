import test from 'node:test'
import assert from 'node:assert/strict'
import { SOURCE_FEED_OVERRIDES } from '../scripts/sourceFeedOverrides.mjs'

test('broken WARN feeds have parseable replacements or are disabled', () => {
  assert.deepEqual(SOURCE_FEED_OVERRIDES['Circle (Blog)'], {
    rss_url: 'https://news.google.com/rss/search?q=site%3Acircle.com%2Fblog+%28USDC+OR+stablecoin+OR+blockchain%29&hl=en-US&gl=US&ceid=US%3Aen',
    enabled: true,
  })
  assert.deepEqual(SOURCE_FEED_OVERRIDES['Tether (Blog)'], {
    url: 'https://tether.io',
    rss_url: 'https://tether.io/feed/',
    enabled: true,
  })
  assert.match(SOURCE_FEED_OVERRIDES['Paxos (Blog)'].rss_url, /site%3Apaxos\.com%2Fblog/)
  assert.match(SOURCE_FEED_OVERRIDES['Ripple (Press)'].rss_url, /site%3Aripple\.com%2Finsights/)
  assert.match(SOURCE_FEED_OVERRIDES['Bithumb Announcements'].rss_url, /site%3Abithumb\.com%2Fnotice/)
  assert.match(SOURCE_FEED_OVERRIDES['Coinone Announcements'].rss_url, /site%3Acoinone\.co\.kr/)
  assert.equal(SOURCE_FEED_OVERRIDES['DeFiLlama (News)'].enabled, false)
  assert.equal(SOURCE_FEED_OVERRIDES['DeFiLlama (News)'].rss_url, null)
})
