import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const sources = [
  // Tier 1 official / regulators
  { name: 'Federal Reserve', type: 'official', tier: '1', url: 'https://www.federalreserve.gov', rss_url: 'https://www.federalreserve.gov/feeds/press.xml', region: 'Global' },
  { name: 'U.S. Treasury', type: 'official', tier: '1', url: 'https://home.treasury.gov', rss_url: 'https://home.treasury.gov/rss/news', region: 'Global' },
  { name: 'OCC', type: 'official', tier: '1', url: 'https://occ.treas.gov', rss_url: 'https://www.fdic.gov/news/events/pressreleases', region: 'Global' },
  { name: 'SEC', type: 'official', tier: '1', url: 'https://www.sec.gov', rss_url: 'https://www.sec.gov/news/pressreleases.rss', region: 'Global' },
  { name: 'CFTC', type: 'official', tier: '1', url: 'https://www.cftc.gov', rss_url: 'https://www.cftc.gov/feeds/all.xml', region: 'Global' },
  { name: 'FinCEN', type: 'official', tier: '1', url: 'https://www.fincen.gov', rss_url: 'https://www.fincen.gov/news', region: 'Global' },
  { name: 'FDIC', type: 'official', tier: '1', url: 'https://www.fdic.gov', rss_url: 'https://www.fdic.gov/resources/community/pressroom/pressreleases.xml', region: 'Global' },
  { name: 'CFPB', type: 'official', tier: '1', url: 'https://www.consumerfinance.gov', rss_url: 'https://www.consumerfinance.gov/about-us/newsroom/news-releases.rss', region: 'Global' },
  { name: 'BIS', type: 'official', tier: '1', url: 'https://www.bis.org', rss_url: 'https://www.bis.org/rss/Press.xml', region: 'Global' },
  { name: 'FSB', type: 'official', tier: '1', url: 'https://www.fsb.org', rss_url: 'https://www.fsb.org/feed/', region: 'Global' },
  { name: 'FATF', type: 'official', tier: '1', url: 'https://www.fatf-gafi.org', rss_url: 'https://www.fatf-gafi.org/content/news-rss.xml', region: 'Global' },
  { name: 'IMF', type: 'official', tier: '1', url: 'https://www.imf.org', rss_url: 'https://www.imf.org/en/News/_layouts/list_feed.aspx?List=13&Category=News+Releases', region: 'Global' },
  { name: 'World Bank', type: 'official', tier: '1', url: 'https://www.worldbank.org', rss_url: 'https://www.worldbank.org/en/news/all/rss', region: 'Global' },
  { name: 'ECB', type: 'official', tier: '1', url: 'https://www.ecb.europa.eu', rss_url: 'https://www.ecb.europa.eu/press/pr/rss/html/index.en.html', region: 'Global' },
  { name: 'European Commission', type: 'official', tier: '1', url: 'https://ec.europa.eu', rss_url: 'https://ec.europa.eu/economy_finance/news_rss_en.xml', region: 'Global' },
  { name: 'ESMA', type: 'official', tier: '1', url: 'https://www.esma.europa.eu', rss_url: 'https://www.esma.europa.eu/rss', region: 'Global' },
  { name: 'EBA', type: 'official', tier: '1', url: 'https://www.eba.europa.eu', rss_url: 'https://www.eba.europa.eu/rss.xml', region: 'Global' },
  { name: 'Bank of England', type: 'official', tier: '1', url: 'https://www.bankofengland.co.uk', rss_url: 'https://www.bankofengland.co.uk/boeapps/rss/RSS.aspx?cat=financialstability', region: 'Global' },
  { name: 'FCA', type: 'official', tier: '1', url: 'https://www.fca.org.uk', rss_url: 'https://www.fca.org.uk/news/rss', region: 'Global' },
  { name: 'HM Treasury', type: 'official', tier: '1', url: 'https://www.gov.uk/government/organisations/hm-treasury', rss_url: 'https://www.gov.uk/government/organisations/hm-treasury.atom', region: 'Global' },
  { name: 'MAS', type: 'official', tier: '1', url: 'https://www.mas.gov.sg', rss_url: 'https://www.mas.gov.sg/rss', region: 'Global' },
  { name: 'HKMA', type: 'official', tier: '1', url: 'https://www.hkma.gov.hk', rss_url: 'https://www.hkma.gov.hk/eng/mns/rss/', region: 'Global' },
  { name: 'SFC', type: 'official', tier: '1', url: 'https://www.sfc.hk', rss_url: 'https://www.sfc.hk/en/News/RSS', region: 'Global' },
  { name: 'Bank of Japan', type: 'official', tier: '1', url: 'https://www.boj.or.jp', rss_url: 'https://www.boj.or.jp/en/rss/press/release/notice.htm', region: 'Global' },
  { name: 'JFSA', type: 'official', tier: '1', url: 'https://www.fsa.go.jp', rss_url: 'https://www.fsa.go.jp/news/news_e.rdf', region: 'Global' },
  { name: 'FINMA', type: 'official', tier: '1', url: 'https://www.finma.ch', rss_url: 'https://www.finma.ch/en/news/rss/newsroom-rss', region: 'Global' },
  { name: 'AMF', type: 'official', tier: '1', url: 'https://www.amf-france.org', rss_url: 'https://www.amf-france.org/en/newsroom/rss', region: 'Global' },
  { name: 'Financial Services Commission (KR)', type: 'official', tier: '1', url: 'https://www.fsc.go.kr', rss_url: 'https://www.fsc.go.kr/eng/rss.xml', region: 'KR' },
  { name: 'Financial Supervisory Service', type: 'official', tier: '1', url: 'https://www.fss.or.kr', rss_url: 'https://www.fss.or.kr/fss/kr/board/list.do?menuNo=200010', region: 'KR' },
  { name: 'Bank of Korea', type: 'official', tier: '1', url: 'https://www.bok.or.kr', rss_url: 'https://www.bok.or.kr/eng/main/main.do', region: 'KR' },
  { name: 'MOEF', type: 'official', tier: '1', url: 'https://www.moef.go.kr', rss_url: 'https://www.moef.go.kr/rb/m/board/eng/rss.jsp', region: 'KR' },

  // Tier 2 major media
  { name: 'Reuters', type: 'web', tier: '2', url: 'https://www.reuters.com', rss_url: 'https://www.reutersagency.com/feed/', region: 'Global' },
  { name: 'Financial Times', type: 'web', tier: '2', url: 'https://www.ft.com', rss_url: 'https://www.ft.com/rss/home', region: 'Global' },
  { name: 'Wall Street Journal', type: 'web', tier: '2', url: 'https://www.wsj.com', rss_url: 'https://www.wsj.com/xml/rss/3_7450.xml', region: 'Global' },
  { name: 'CNBC', type: 'web', tier: '2', url: 'https://www.cnbc.com', rss_url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', region: 'Global' },

  // Tier 3 media / company blogs / research
  { name: 'CoinDesk', type: 'web', tier: '3', url: 'https://www.coindesk.com', rss_url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', region: 'Global' },
  { name: 'The Block', type: 'web', tier: '3', url: 'https://www.theblock.co', rss_url: 'https://www.theblock.co/rss.xml', region: 'Global' },
  { name: 'DL News', type: 'web', tier: '4', url: 'https://www.dlnews.com', rss_url: 'https://www.dlnews.com/feed', region: 'Global' },
  { name: 'DeFiLlama', type: 'web', tier: '4', url: 'https://defillama.com', rss_url: 'https://defillama.com/news/rss', region: 'Global' },
  { name: 'Circle', type: 'official', tier: '3', url: 'https://www.circle.com', rss_url: 'https://www.circle.com/rss.xml', region: 'Global' },
  { name: 'Tether', type: 'official', tier: '3', url: 'https://tether.to', rss_url: 'https://tether.to/feed/', region: 'Global' },
  { name: 'Paxos', type: 'official', tier: '3', url: 'https://paxos.com', rss_url: 'https://www.paxos.com/feed/', region: 'Global' },
  { name: 'PayPal', type: 'official', tier: '3', url: 'https://www.paypal.com', rss_url: 'https://www.paypal.com/si/sitemap.xml', region: 'Global' },
  { name: 'Visa', type: 'official', tier: '3', url: 'https://www.visa.com', rss_url: 'https://usa.visa.com/en_au/newsroom/press-releases/feeds.rss', region: 'Global' },
  { name: 'Mastercard', type: 'official', tier: '3', url: 'https://www.mastercard.com', rss_url: 'https://www.mastercard.com/news/feeds.xml', region: 'Global' },
  { name: 'Ripple', type: 'official', tier: '3', url: 'https://ripple.com', rss_url: 'https://ripple.com/category/press/rss', region: 'Global' },
  { name: 'Bloomberg Crypto', type: 'web', tier: '2', url: 'https://www.bloomberg.com', rss_url: 'https://www.bloomberg.com/feed', region: 'Global' },
  { name: 'Chainalysis', type: 'web', tier: '3', url: 'https://www.chainalysis.com', rss_url: 'https://www.chainalysis.com/rss', region: 'Global' },
  { name: 'TRM Labs', type: 'web', tier: '3', url: 'https://www.trmlabs.com', rss_url: 'https://www.trmlabs.com/resources', region: 'Global' },
  { name: 'Elliptic', type: 'web', tier: '3', url: 'https://www.elliptic.co', rss_url: 'https://www.elliptic.co/rss', region: 'Global' },

  // Tier 4 references
  { name: 'Artemis Stablecoins Metrics', type: 'web', tier: '4', url: 'https://stablecoins.wtf', rss_url: 'https://stablecoins.wtf/feed', region: 'Global' },
  { name: 'CoinGecko', type: 'web', tier: '4', url: 'https://www.coingecko.com', rss_url: 'https://www.coingecko.com/en/rss', region: 'Global' },
  { name: 'CoinMarketCap', type: 'web', tier: '4', url: 'https://coinmarketcap.com', rss_url: 'https://coinmarketcap.com/rss/news', region: 'Global' },
]

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const normalized = sources.map((source) => ({
    ...source,
    region: source.region || null,
  }))

  const { error } = await supabase
    .from('sources')
    .upsert(normalized, { onConflict: 'name' })

  if (error) {
    console.error('seed_sources_error:', error)
    process.exit(1)
  }

  console.log(`seed_sources_ok: ${normalized.length} rows upserted`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
