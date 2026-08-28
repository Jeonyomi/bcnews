import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHot24DedupeKey,
  buildHot24Message,
  buildVerifiedRelatedCounts,
  evaluateHot24Candidates,
  identifyHot24AssetSymbol,
  isPublishableKoreanNarrative,
  parseYahooDailyReaction,
  trimToCompleteSentence,
  selectHot24Candidate,
  type Hot24Candidate,
} from '../lib/mbaiHot24Config.ts'

const now = '2026-08-28T11:30:00.000Z'
const candidate = (overrides: Partial<Hot24Candidate> = {}): Hot24Candidate => ({
  issueId: 101,
  title: '미 연준 정책 변화에 주식·비트코인 동반 반응',
  summary: '연준의 정책 신호가 위험자산 전반의 가격 변동을 키웠습니다.',
  whyItMatters: '금리 경로 변화는 미국 성장주와 한국 성장주, 크립토의 할인율에 동시에 영향을 줍니다.',
  topic: 'Macro',
  region: 'Global',
  importanceScore: 88,
  importanceLabel: 'critical',
  firstSeenAt: '2026-08-28T02:00:00.000Z',
  lastSeenAt: '2026-08-28T10:45:00.000Z',
  sourceName: 'Federal Reserve',
  sourceTier: 'official',
  articleUrl: 'https://www.federalreserve.gov/example',
  keyEntities: ['Federal Reserve', 'Bitcoin'],
  tags: ['rates', 'stocks', 'crypto'],
  updateCount: 3,
  asset: null,
  ...overrides,
})

test('HOT 24 rejects stale and weak issues and ranks a material cross-market issue', () => {
  const evaluated = evaluateHot24Candidates([
    candidate(),
    candidate({ issueId: 102, importanceScore: 45, title: '홍보성 서비스 업데이트' }),
    candidate({ issueId: 103, lastSeenAt: '2026-08-26T10:00:00.000Z' }),
  ], now)

  assert.equal(evaluated.length, 1)
  assert.equal(evaluated[0].issueId, 101)
  assert.ok(evaluated[0].hotScore >= 70)
  assert.equal(selectHot24Candidate(evaluated)?.issueId, 101)
})

test('HOT 24 classifies an entity with verified market reaction as ASSET', () => {
  const evaluated = evaluateHot24Candidates([
    candidate({
      issueId: 201,
      title: '엔비디아 실적 이후 AI 자산으로 거래 집중',
      keyEntities: ['NVIDIA'],
      asset: {
        symbol: 'NVDA',
        name: '엔비디아',
        market: '미국주식',
        price: 210.5,
        change24h: 6.8,
        volumeRatio: 2.3,
        source: 'Yahoo Finance',
      },
    }),
  ], now)

  assert.equal(evaluated[0].contentType, 'ASSET')
  assert.equal(evaluated[0].asset?.symbol, 'NVDA')
})

test('HOT 24 builds one daily dedupe key and a sourced MarkdownV2 bridge message', () => {
  const selected = evaluateHot24Candidates([candidate()], now)[0]
  assert.equal(buildHot24DedupeKey('2026-08-28'), 'mbai_hot24:2026-08-28')
  const message = buildHot24Message(selected, now)
  assert.match(message, /🔥 \*HOT 24 \\· NEWS\*/)
  assert.match(message, /무슨 일이 있었나/)
  assert.match(message, /시장이 어떻게 반응했나/)
  assert.match(message, /MARKET BRIDGE/)
  assert.match(message, /다음 확인 조건/)
  assert.match(message, /Federal Reserve/)
  assert.match(message, /투자 판단을 위한 참고 정보/)
  assert.doesNotMatch(message, /undefined|null/)
  assert.doesNotMatch(message, /\\\\\\\\\./)
})

test('HOT 24 removes a truncated trailing fragment and keeps complete sentences', () => {
  assert.equal(
    trimToCompleteSentence('첫 번째 문장입니다. 두 번째 문장입니다. 잘린 마지막 문장'),
    '첫 번째 문장입니다. 두 번째 문장입니다.',
  )
  assert.equal(trimToCompleteSentence('완결 문장이 없습니다'), '')
})

test('HOT 24 requires a coherent Korean narrative before automatic publishing', () => {
  assert.equal(isPublishableKoreanNarrative(
    '비트코인 ETF 거래량이 사상 최대를 기록했다',
    '기관 매수세가 확대되며 비트코인과 관련주가 동반 상승했습니다.',
    '미국 위험선호가 한국 관련주와 크립토 시장으로 확산되는지 확인해야 합니다.',
  ), true)
  assert.equal(isPublishableKoreanNarrative(
    'Bitcoin ETF volume hits a record',
    'Institutional demand pushed crypto prices higher.',
    'Watch the next session.',
  ), false)
  assert.equal(isPublishableKoreanNarrative(
    '비트코인 뉴스',
    '<a href="https://example.com">원문 링크</a>',
    '',
  ), false)
})

test('HOT 24 rejects every future-dated candidate', () => {
  assert.equal(evaluateHot24Candidates([
    candidate({ lastSeenAt: '2026-08-28T11:31:00.000Z' }),
  ], now).length, 0)
})

test('HOT 24 only maps precise company aliases to market symbols', () => {
  assert.equal(identifyHot24AssetSymbol('Coin regulation expands worldwide'), null)
  assert.equal(identifyHot24AssetSymbol('A strategy for stablecoin payments'), null)
  assert.equal(identifyHot24AssetSymbol('스트래티지 수립과 리스크 관리가 필요하다'), null)
  assert.equal(identifyHot24AssetSymbol('Coinbase shares rally after earnings'), 'COIN')
  assert.equal(identifyHot24AssetSymbol('MicroStrategy bitcoin holdings rise'), 'MSTR')
})

test('HOT 24 counts only semantically related reports instead of every shared issue id', () => {
  const counts = buildVerifiedRelatedCounts([
    { id: 18003, issueId: 144, title: '스트레티지 MSTR 거래량, 델 웃돌았다', summary: 'MSTR 거래량과 비트코인 관련주의 관심이 커졌다.', sourceName: 'Tokenpost' },
    { id: 18004, issueId: 144, title: 'MSTR 거래량이 주요 기술주를 추월했다', summary: '마이크로스트래티지 거래량과 투자자 관심 증가를 분석했다.', sourceName: 'Reuters' },
    { id: 18005, issueId: 144, title: 'MSTR 거래량과 투자자 관심 증가', summary: '스트레티지 거래량이 늘며 투자자 관심이 이어졌다.', sourceName: 'Tokenpost' },
    { id: 18007, issueId: 144, title: '1인치 취약점 32건 보상', summary: '디파이 프로토콜이 보안 취약점 신고자에게 보상했다.', sourceName: 'Tokenpost' },
    { id: 17960, issueId: 144, title: '스테이블코인 수출대금 원화 정산 구축', summary: '국내 사업자가 스테이블코인 결제 시스템을 구축했다.', sourceName: 'Tokenpost' },
    { id: 18101, issueId: 144, title: 'BTC ETF 순유입 확대', summary: '비트코인 현물 ETF에 기관 자금이 유입됐다.', sourceName: 'Reuters' },
    { id: 18102, issueId: 144, title: 'BTC 공매도 고래 손실 확대', summary: '비트코인 숏 포지션을 보유한 고래의 손실이 커졌다.', sourceName: 'Bloomberg' },
    { id: 18201, issueId: 144, title: 'Advanced Micro Devices earnings guidance rises', summary: 'AMD quarterly revenue beat expectations.', sourceName: 'Reuters' },
    { id: 18202, issueId: 144, title: 'Advanced Micro Devices appoints new director', summary: 'AMD named a new independent board member.', sourceName: 'Bloomberg' },
    { id: 18301, issueId: 144, title: 'BTC ETF 기관 순유입 지속', summary: '비트코인 현물 ETF 기관 순유입이 이어졌다.', sourceName: 'Reuters' },
    { id: 18302, issueId: 144, title: 'ETF 기관 순유입 지속', summary: '현물 ETF 기관 순유입이 이어졌다.', sourceName: 'Bloomberg' },
  ])
  assert.equal(counts.get(18003), 1)
  assert.equal(counts.get(18004), 1)
  assert.equal(counts.get(18005), 1)
  assert.equal(counts.get(18007), 0)
  assert.equal(counts.get(17960), 0)
  assert.equal(counts.get(18101), 0)
  assert.equal(counts.get(18102), 0)
  assert.equal(counts.get(18201), 0)
  assert.equal(counts.get(18202), 0)
  assert.equal(counts.get(18301), 0)
  assert.equal(counts.get(18302), 0)
})

test('HOT 24 rejects stale or future Yahoo daily reactions', () => {
  const payload = {
    chart: { result: [{
      timestamp: [1787798400, 1787884800],
      indicators: { quote: [{ close: [100, 104], volume: [1000, 2200] }] },
    }] },
  }
  assert.equal(parseYahooDailyReaction(payload, '2026-08-28T11:30:00.000Z').change24h, 4)
  assert.throws(() => parseYahooDailyReaction(payload, '2026-08-31T11:30:00.000Z'), /stale_hot24_yahoo/)
  assert.throws(() => parseYahooDailyReaction(payload, '2026-08-27T00:00:00.000Z'), /future_hot24_yahoo/)

  const unordered = structuredClone(payload)
  unordered.chart.result[0].timestamp = [1787884800, 1787798400]
  assert.throws(() => parseYahooDailyReaction(unordered, '2026-08-28T11:30:00.000Z'), /unordered_hot24_yahoo/)

  const stretched = structuredClone(payload)
  stretched.chart.result[0].timestamp = [1787539200, 1787884800]
  assert.throws(() => parseYahooDailyReaction(stretched, '2026-08-28T11:30:00.000Z'), /stretched_hot24_yahoo/)
})

test('HOT 24 clamps untrusted database text below Telegram limit', () => {
  const selected = evaluateHot24Candidates([candidate({
    title: `긴 제목 ${'가'.repeat(5000)}`,
    summary: `${'긴 요약 문장입니다. '.repeat(600)}`,
    whyItMatters: `${'중요한 이유입니다. '.repeat(600)}`,
    sourceName: '출처'.repeat(2000),
  })], now)[0]
  assert.ok(buildHot24Message(selected, now).length <= 3900)
})

test('HOT 24 returns no selection when no candidate clears the publish threshold', () => {
  const evaluated = evaluateHot24Candidates([
    candidate({ importanceScore: 51, sourceTier: 'media', updateCount: 0, keyEntities: [] }),
  ], now)
  assert.equal(selectHot24Candidate(evaluated), null)
})
