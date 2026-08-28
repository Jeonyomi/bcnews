export type Hot24AssetReaction = {
  symbol: string
  name: string
  market: '한국주식' | '미국주식' | '크립토'
  price: number
  change24h: number
  volumeRatio: number | null
  source: string
}

export type Hot24Candidate = {
  issueId: number
  title: string
  summary: string
  whyItMatters: string
  topic: string
  region: string
  importanceScore: number
  importanceLabel: string
  firstSeenAt: string
  lastSeenAt: string
  sourceName: string
  sourceTier: string
  articleUrl: string
  keyEntities: string[]
  tags: string[]
  updateCount: number
  asset: Hot24AssetReaction | null
}

export type Hot24ClusterArticle = {
  id: number
  issueId: number
  title: string
  summary: string
  sourceName: string
}

const CLUSTER_STOP_WORDS = new Set([
  '관련', '시장', '미국', '국내', '통해', '대한', '이번', '지난', '위한', '했다', '밝혔다',
  '분석', '전망', '증가', '감소', '확대', '상승', '하락', '기록', '발표', '뉴스', '주식', '가격', '거래',
])
const normalizeClusterToken = (value: string) => value.toLowerCase()
  .replace(/[^0-9a-z가-힣]/g, '')
  .replace(/(으로|에서|에게|까지|부터|보다|처럼|은|는|이|가|을|를|의|와|과|로|에)$/u, '')
const clusterTokens = (value: string) => new Set(String(value || '').split(/\s+/)
  .map(normalizeClusterToken)
  .filter((token) => token.length >= 2 && !CLUSTER_STOP_WORDS.has(token)))
const overlapCount = (left: Set<string>, right: Set<string>) => {
  let count = 0
  for (const token of left) if (right.has(token)) count += 1
  return count
}
const isClusterAssetToken = (token: string) => HOT24_ASSET_ALIASES.some((asset) =>
  asset.aliases.some((alias) => clusterTokens(alias).has(token)))

export const buildVerifiedRelatedCounts = (articles: Hot24ClusterArticle[]) => {
  const prepared = articles.map((article) => {
    const text = `${article.title} ${article.summary}`
    return {
      ...article,
      symbol: identifyHot24AssetSymbol(text),
      titleTokens: clusterTokens(article.title),
      allTokens: clusterTokens(text),
      eventTokens: new Set([...clusterTokens(text)].filter((token) => !isClusterAssetToken(token))),
    }
  })
  const counts = new Map<number, number>()
  for (const article of prepared) {
    const related = new Set<string>()
    for (const other of prepared) {
      if (article.id === other.id || article.issueId !== other.issueId) continue
      if (article.sourceName.trim().toLowerCase() === other.sourceName.trim().toLowerCase()) continue
      if (Boolean(article.symbol) !== Boolean(other.symbol)) continue
      if (article.symbol && other.symbol && article.symbol !== other.symbol) continue
      const titleOverlap = overlapCount(article.titleTokens, other.titleTokens)
      const allOverlap = overlapCount(article.allTokens, other.allTokens)
      const eventOverlap = overlapCount(article.eventTokens, other.eventTokens)
      const sameAsset = Boolean(article.symbol && article.symbol === other.symbol)
      const isRelated = sameAsset ? eventOverlap >= 2 : titleOverlap >= 2 && allOverlap >= 3
      if (!isRelated) continue
      related.add(other.sourceName.trim().toLowerCase())
    }
    counts.set(article.id, related.size)
  }
  return counts
}

export type EvaluatedHot24Candidate = Hot24Candidate & {
  hotScore: number
  contentType: 'NEWS' | 'ASSET'
}

const HOT24_ASSET_ALIASES = [
  { symbol: 'NVDA', aliases: ['nvidia', '엔비디아', 'nvda'] },
  { symbol: 'TSLA', aliases: ['tesla', '테슬라', 'tsla'] },
  { symbol: 'MSTR', aliases: ['microstrategy', '마이크로스트래티지', 'mstr'] },
  { symbol: 'COIN', aliases: ['coinbase', '코인베이스'] },
  { symbol: 'AMD', aliases: ['advanced micro devices', 'amd'] },
  { symbol: 'AAPL', aliases: ['apple', '애플', 'aapl'] },
  { symbol: 'MSFT', aliases: ['microsoft', '마이크로소프트', 'msft'] },
  { symbol: 'META', aliases: ['meta platforms', '메타 플랫폼스'] },
  { symbol: 'GOOGL', aliases: ['alphabet', 'google', '알파벳', '구글', 'googl'] },
  { symbol: 'AMZN', aliases: ['amazon', '아마존', 'amzn'] },
  { symbol: '005930.KS', aliases: ['samsung electronics', '삼성전자', '005930'] },
  { symbol: '000660.KS', aliases: ['sk hynix', 'sk하이닉스', '하이닉스', '000660'] },
  { symbol: 'BTC-USD', aliases: ['bitcoin', '비트코인', 'btc'] },
  { symbol: 'ETH-USD', aliases: ['ethereum', '이더리움', 'eth'] },
]

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const identifyHot24AssetSymbol = (value: string) => {
  const text = String(value || '').toLowerCase()
  return HOT24_ASSET_ALIASES.find((asset) => asset.aliases.some((alias) => {
    const normalized = alias.toLowerCase()
    return normalized.length <= 5
      ? new RegExp(`(^|[^a-z0-9])${escapeRegex(normalized)}([^a-z0-9]|$)`, 'i').test(text)
      : text.includes(normalized)
  }))?.symbol || null
}

export const parseYahooDailyReaction = (payload: any, observedAt: string) => {
  const observed = new Date(observedAt).getTime() / 1000
  if (!Number.isFinite(observed)) throw new Error('invalid_hot24_observed_at')
  const result = payload?.chart?.result?.[0]
  const timestamps = result?.timestamp
  const closes = result?.indicators?.quote?.[0]?.close
  const volumes = result?.indicators?.quote?.[0]?.volume
  if (!Array.isArray(timestamps) || !Array.isArray(closes) || !Array.isArray(volumes)) {
    throw new Error('invalid_hot24_yahoo')
  }
  const valid = timestamps.map((timestamp: unknown, index: number) => ({
    timestamp: Number(timestamp), close: Number(closes[index]), volume: Number(volumes[index]),
  })).filter(({ timestamp, close, volume }: { timestamp: number; close: number; volume: number }) =>
    Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(close) && close > 0
      && Number.isFinite(volume) && volume >= 0,
  )
  if (valid.length < 2) throw new Error('insufficient_hot24_yahoo')
  for (let index = 1; index < valid.length; index += 1) {
    if (valid[index].timestamp <= valid[index - 1].timestamp) throw new Error('unordered_hot24_yahoo')
  }
  const latest = valid.at(-1)!
  const previous = valid.at(-2)!
  const baselineGap = latest.timestamp - previous.timestamp
  if (baselineGap > 36 * 60 * 60) throw new Error('stretched_hot24_yahoo')
  if (latest.timestamp - observed > 300 || previous.timestamp - observed > 300) throw new Error('future_hot24_yahoo')
  if (observed - latest.timestamp > 36 * 60 * 60) throw new Error('stale_hot24_yahoo')
  const baselineVolumes = valid.slice(Math.max(0, valid.length - 6), -1)
    .map((point: { volume: number }) => point.volume).filter((volume: number) => volume > 0)
  const averageVolume = baselineVolumes.length
    ? baselineVolumes.reduce((sum: number, volume: number) => sum + volume, 0) / baselineVolumes.length
    : 0
  return {
    price: latest.close,
    change24h: ((latest.close - previous.close) / previous.close) * 100,
    volumeRatio: averageVolume > 0 ? latest.volume / averageVolume : null,
    latestTimestamp: latest.timestamp,
  }
}

const PUBLISH_THRESHOLD = 65
const HOUR_MS = 60 * 60 * 1000
const round = (value: number, decimals = 1) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}
const escapeMarkdownV2 = (value: string) => String(value || '').replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const signed = (value: number, decimals = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(decimals)}`
const formatPrice = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: value >= 100 ? 2 : 6 })

export const trimToCompleteSentence = (value: string, maxSentences = 3) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized || !Number.isInteger(maxSentences) || maxSentences <= 0) return ''
  return normalized.split(/(?<=[.!?。！？])\s+/u)
    .filter((sentence) => /[.!?。！？]$/u.test(sentence))
    .slice(0, maxSentences)
    .join(' ')
    .trim()
}

export const isPublishableKoreanNarrative = (title: string, summary: string, whyItMatters: string) => {
  const fields = [title, summary, whyItMatters].map((value) => String(value || '').trim())
  const combined = fields.join(' ')
  if (/<[^>]+>|https?:\/\//i.test(combined)) return false
  const hangulCount = (combined.match(/[가-힣]/g) || []).length
  const visibleCount = (combined.match(/[\p{L}\p{N}]/gu) || []).length
  return fields[1].length >= 30 && fields[2].length >= 20 && hangulCount >= 30
    && visibleCount > 0 && hangulCount / visibleCount >= 0.2
}

const hasCrossMarketReach = (candidate: Hot24Candidate) => {
  const text = [candidate.title, candidate.summary, candidate.whyItMatters, ...candidate.tags, ...candidate.keyEntities]
    .join(' ').toLowerCase()
  const groups = [
    ['한국', 'kospi', 'kosdaq', '원화', 'krw', '반도체'],
    ['미국', 'nasdaq', 's&p', '연준', 'fed', '금리', '달러', 'nvidia'],
    ['비트코인', 'bitcoin', 'btc', 'ethereum', '이더리움', 'crypto', '크립토', 'stablecoin'],
  ]
  return groups.filter((terms) => terms.some((term) => text.includes(term))).length >= 2
}

const hasVerifiedAssetReaction = (asset: Hot24AssetReaction | null) => Boolean(
  asset && Number.isFinite(asset.price) && asset.price > 0
  && Number.isFinite(asset.change24h)
  && (Math.abs(asset.change24h) >= 3 || (asset.volumeRatio != null && asset.volumeRatio >= 1.8)),
)

export const evaluateHot24Candidates = (
  candidates: Hot24Candidate[],
  observedAt = new Date().toISOString(),
): EvaluatedHot24Candidate[] => {
  const now = new Date(observedAt).getTime()
  if (!Number.isFinite(now)) throw new Error('invalid_hot24_observed_at')

  return candidates.flatMap((candidate) => {
    const lastSeen = new Date(candidate.lastSeenAt).getTime()
    const ageHours = (now - lastSeen) / HOUR_MS
    if (!Number.isFinite(lastSeen) || ageHours < 0 || ageHours > 24) return []
    if (!Number.isFinite(candidate.importanceScore) || candidate.importanceScore < 50) return []

    const authority = candidate.sourceTier.toLowerCase() === 'official'
      ? 12
      : ['tier1', '1', 'a'].includes(candidate.sourceTier.toLowerCase()) ? 9 : 5
    const recency = Math.max(0, 15 * (1 - ageHours / 24))
    const updates = Math.min(8, Math.max(0, candidate.updateCount) * 2)
    const crossMarket = hasCrossMarketReach(candidate) ? 10 : 0
    const assetReaction = hasVerifiedAssetReaction(candidate.asset) ? 10 : 0
    const hotScore = round(Math.min(100,
      candidate.importanceScore * 0.55 + authority + recency + updates + crossMarket + assetReaction,
    ))
    return [{
      ...candidate,
      hotScore,
      contentType: hasVerifiedAssetReaction(candidate.asset) ? 'ASSET' as const : 'NEWS' as const,
    }]
  }).sort((a, b) => b.hotScore - a.hotScore || b.importanceScore - a.importanceScore || b.issueId - a.issueId)
}

export const selectHot24Candidate = (candidates: EvaluatedHot24Candidate[]) =>
  candidates.find((candidate) => candidate.hotScore >= PUBLISH_THRESHOLD) || null

export const buildHot24DedupeKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('invalid_hot24_date_key')
  return `mbai_hot24:${dateKey}`
}

const marketBridge = (candidate: EvaluatedHot24Candidate) => {
  if (candidate.asset?.market === '크립토') {
    return ['🇰🇷 관련 테마주의 수급 확산 여부', '🇺🇸 위험자산과 크립토 관련주의 동행 여부', '₿ 거래량과 온체인 자금 유입의 지속 여부']
  }
  if (candidate.asset?.market === '한국주식') {
    return ['🇰🇷 외국인·기관 수급과 관련 업종 확산 여부', '🇺🇸 같은 산업의 선행 종목 움직임', '₿ 위험선호가 크립토까지 확산되는지 확인']
  }
  return ['🇰🇷 환율과 관련 업종·테마의 다음 거래일 반응', '🇺🇸 금리·지수와 핵심 자산의 동행 여부', '₿ BTC·ETH 거래량이 같은 방향으로 반응하는지 확인']
}

const clipPlain = (value: string, maxLength: number) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1).trim()}…`
}

export const buildHot24Message = (candidate: EvaluatedHot24Candidate, observedAt: string) => {
  const observed = new Date(observedAt)
  if (!Number.isFinite(observed.getTime())) throw new Error('invalid_hot24_observed_at')
  const kst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(observed).replace(',', '')
  const bridge = marketBridge(candidate)
  const title = clipPlain(candidate.asset?.name || candidate.title, 160)
  const summary = clipPlain(trimToCompleteSentence(candidate.summary || candidate.title, 2), 900)
  const whyItMatters = clipPlain(trimToCompleteSentence(
    candidate.whyItMatters || '시장 가격과 자금 흐름에 미치는 영향을 추가 확인해야 합니다.', 2,
  ), 700)
  const sourceName = clipPlain(candidate.sourceName, 80)
  const reaction = candidate.asset
    ? `${candidate.asset.name} ${formatPrice(candidate.asset.price)} · 24시간 ${signed(candidate.asset.change24h)}%${candidate.asset.volumeRatio == null ? '' : ` · 거래량 ${candidate.asset.volumeRatio.toFixed(1)}배`}`
    : `관련 보도 ${candidate.updateCount + 1}건 · 시장가격 직접 반응은 추가 확인`
  const next = candidate.asset
    ? `${candidate.asset.symbol}의 거래량 유지와 관련 시장으로의 수급 확산 여부`
    : '후속 공식 발표와 가격·거래량 반응이 두 시장 이상으로 확산되는지 확인'

  const message = [
    `🔥 *HOT 24 \\· ${candidate.contentType}*`,
    `*${escapeMarkdownV2(title)} \\| 24시간 시장의 중심*`,
    '',
    '📰 *무슨 일이 있었나*',
    escapeMarkdownV2(summary),
    '',
    '📊 *시장이 어떻게 반응했나*',
    escapeMarkdownV2(reaction),
    '',
    '💡 *왜 중요한가*',
    escapeMarkdownV2(whyItMatters),
    '',
    '🌉 *MARKET BRIDGE*',
    ...bridge.map(escapeMarkdownV2),
    '',
    '👀 *다음 확인 조건*',
    escapeMarkdownV2(next),
    '',
    `출처: ${escapeMarkdownV2(sourceName)} · ${escapeMarkdownV2(candidate.asset?.source || 'MB.AI News Intelligence')}`,
    `조회: ${escapeMarkdownV2(kst)} KST`,
    '',
    '※ 투자 판단을 위한 참고 정보이며 매수·매도 권유가 아닙니다\.',
  ].join('\n')
  if (message.length > 3900) throw new Error('hot24_message_too_long')
  return message
}
