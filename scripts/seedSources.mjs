import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('Missing SUPABASE_URL')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

// NOTE:
// - Safe-by-default: anything likely paywalled / no confirmed RSS is set enabled:false.
// - Current DB schema (migrations/002) supports: name,type,tier,url,rss_url,region,enabled.
// - We map MJ SPEC categories into (type,tier) and keep Region limited to Global/KR.

const sources = [
  // ------------------------------------------------------------
  // (3) Regulators / Policy (Official) — Tier 1
  // ------------------------------------------------------------
  { name: 'OCC', type: 'official', tier: '1', url: 'https://occ.treas.gov', rss_url: null, region: 'Global', enabled: false },
  { name: 'SEC', type: 'official', tier: '1', url: 'https://www.sec.gov', rss_url: 'https://www.sec.gov/news/pressreleases.rss', region: 'Global', enabled: true },
  { name: 'CFTC', type: 'official', tier: '1', url: 'https://www.cftc.gov', rss_url: 'https://www.cftc.gov/PressRoom/PressReleases/rss', region: 'Global', enabled: true },
  { name: 'Federal Reserve', type: 'official', tier: '1', url: 'https://www.federalreserve.gov', rss_url: 'https://www.federalreserve.gov/feeds/press_all.xml', region: 'Global', enabled: true },
  { name: 'U.S. Treasury', type: 'official', tier: '1', url: 'https://home.treasury.gov', rss_url: 'https://home.treasury.gov/rss/news', region: 'Global', enabled: true },
  { name: 'FinCEN', type: 'official', tier: '1', url: 'https://www.fincen.gov', rss_url: null, region: 'Global', enabled: false },

  { name: 'BIS', type: 'official', tier: '1', url: 'https://www.bis.org', rss_url: 'https://www.bis.org/rss/press.xml', region: 'Global', enabled: true },
  { name: 'FSB', type: 'official', tier: '1', url: 'https://www.fsb.org', rss_url: 'https://www.fsb.org/feed/', region: 'Global', enabled: true },
  { name: 'IOSCO', type: 'official', tier: '1', url: 'https://www.iosco.org', rss_url: null, region: 'Global', enabled: false },

  // EU policy track (optional per SPEC)
  { name: 'ESMA', type: 'official', tier: '1', url: 'https://www.esma.europa.eu', rss_url: null, region: 'Global', enabled: false },
  { name: 'EBA', type: 'official', tier: '1', url: 'https://www.eba.europa.eu', rss_url: 'https://www.eba.europa.eu/rss.xml', region: 'Global', enabled: true },
  { name: 'ECB', type: 'official', tier: '1', url: 'https://www.ecb.europa.eu', rss_url: 'https://www.ecb.europa.eu/press/pr/rss/rss.en.xml', region: 'Global', enabled: true },

  // ------------------------------------------------------------
  // (1) Stablecoin/Crypto Tier-1 Media — Tier 1 (SPEC)
  // ------------------------------------------------------------
  { name: 'CoinDesk', type: 'rss', tier: '1', url: 'https://www.coindesk.com', rss_url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', region: 'Global', enabled: true },
  { name: 'The Block', type: 'rss', tier: '1', url: 'https://www.theblock.co', rss_url: 'https://www.theblock.co/rss.xml', region: 'Global', enabled: true },
  { name: 'Blockworks', type: 'rss', tier: '1', url: 'https://blockworks.co', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm feed
  { name: 'Decrypt', type: 'rss', tier: '1', url: 'https://decrypt.co', rss_url: 'https://decrypt.co/feed', region: 'Global', enabled: true },
  { name: 'Cointelegraph', type: 'rss', tier: '1', url: 'https://cointelegraph.com', rss_url: 'https://cointelegraph.com/rss', region: 'Global', enabled: true },

  // ------------------------------------------------------------
  // (2) Stablecoin/CBDC/Payments + Official Protocol blogs — Tier 2
  // ------------------------------------------------------------
  { name: 'Ledger Insights', type: 'rss', tier: '2', url: 'https://www.ledgerinsights.com', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm feed

  { name: 'Circle (Blog)', type: 'official', tier: '2', url: 'https://www.circle.com', rss_url: 'https://www.circle.com/rss.xml', region: 'Global', enabled: true },
  { name: 'Tether (Blog)', type: 'official', tier: '2', url: 'https://tether.to', rss_url: 'https://tether.to/feed/', region: 'Global', enabled: true },
  { name: 'Paxos (Blog)', type: 'official', tier: '2', url: 'https://paxos.com', rss_url: 'https://www.paxos.com/feed/', region: 'Global', enabled: true },
  { name: 'Ripple (Press)', type: 'official', tier: '2', url: 'https://ripple.com', rss_url: 'https://ripple.com/category/press/rss', region: 'Global', enabled: true },

  { name: 'Stellar (Blog)', type: 'official', tier: '2', url: 'https://stellar.org', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm RSS
  { name: 'Chainlink (Blog)', type: 'official', tier: '2', url: 'https://chain.link', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm RSS
  { name: 'Ethereum Foundation (Blog)', type: 'official', tier: '2', url: 'https://blog.ethereum.org', rss_url: 'https://blog.ethereum.org/feed.xml', region: 'Global', enabled: true },

  // ------------------------------------------------------------
  // (4) Data/Research/Onchain Intelligence (public) — Tier 2/3
  // ------------------------------------------------------------
  { name: 'Chainalysis (Blog)', type: 'rss', tier: '2', url: 'https://www.chainalysis.com', rss_url: 'https://www.chainalysis.com/rss', region: 'Global', enabled: true },
  { name: 'Elliptic (Blog)', type: 'rss', tier: '2', url: 'https://www.elliptic.co', rss_url: 'https://www.elliptic.co/rss', region: 'Global', enabled: true },
  { name: 'Messari (Public Posts)', type: 'rss', tier: '3', url: 'https://messari.io', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm RSS/public feed
  { name: 'Dune (Public)', type: 'web', tier: '3', url: 'https://dune.com', rss_url: null, region: 'Global', enabled: false }, // no RSS
  { name: 'DeFiLlama (News)', type: 'rss', tier: '3', url: 'https://defillama.com', rss_url: 'https://defillama.com/news/rss', region: 'Global', enabled: true },

  // Optional research sources
  { name: 'a16z crypto (Blog)', type: 'rss', tier: '3', url: 'https://a16zcrypto.com', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm RSS
  { name: 'Visa (Press)', type: 'official', tier: '3', url: 'https://usa.visa.com', rss_url: 'https://usa.visa.com/en_au/newsroom/press-releases/feeds.rss', region: 'Global', enabled: true },

  // ------------------------------------------------------------
  // (5) AI/LLM/AI Infra Media — Tier 2/3
  // ------------------------------------------------------------
  { name: 'MIT Technology Review', type: 'rss', tier: '2', url: 'https://www.technologyreview.com', rss_url: 'https://www.technologyreview.com/feed/', region: 'Global', enabled: true },
  { name: 'VentureBeat (AI)', type: 'web', tier: '2', url: 'https://venturebeat.com', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm AI feed
  { name: 'TechCrunch (AI)', type: 'web', tier: '2', url: 'https://techcrunch.com', rss_url: null, region: 'Global', enabled: false }, // TODO: confirm AI feed
  { name: 'The Verge', type: 'rss', tier: '3', url: 'https://www.theverge.com', rss_url: 'https://www.theverge.com/rss/index.xml', region: 'Global', enabled: true },
  { name: 'Ars Technica', type: 'rss', tier: '3', url: 'https://arstechnica.com', rss_url: 'https://feeds.arstechnica.com/arstechnica/index', region: 'Global', enabled: true },

  // Optional “Dev Pulse”
  { name: 'Hacker News (frontpage)', type: 'rss', tier: '3', url: 'https://news.ycombinator.com', rss_url: 'https://hnrss.org/frontpage', region: 'Global', enabled: true },
  { name: 'GitHub Trending', type: 'web', tier: '3', url: 'https://github.com/trending', rss_url: null, region: 'Global', enabled: false },

  // ------------------------------------------------------------
  // Korea (official) — Tier 1
  // ------------------------------------------------------------
  { name: 'Financial Services Commission (KR)', type: 'official', tier: '1', url: 'https://www.fsc.go.kr', rss_url: 'https://www.fsc.go.kr/eng/rss.xml', region: 'KR', enabled: true },
  { name: 'MOEF (KR)', type: 'official', tier: '1', url: 'https://www.moef.go.kr', rss_url: 'https://www.moef.go.kr/eng/rss.xml', region: 'KR', enabled: true },
  { name: 'Financial Supervisory Service (KR)', type: 'official', tier: '1', url: 'https://www.fss.or.kr', rss_url: null, region: 'KR', enabled: false },
  { name: 'Bank of Korea (KR)', type: 'official', tier: '1', url: 'https://www.bok.or.kr', rss_url: null, region: 'KR', enabled: false },
]

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const normalized = sources.map((s) => ({
    enabled: s.enabled ?? true,
    rss_url: s.rss_url ?? null,
    tier: s.tier ? String(s.tier) : null,
    region: s.region || null,
    ...s,
  }))

  const { error } = await supabase.from('sources').upsert(normalized, { onConflict: 'name' })

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
