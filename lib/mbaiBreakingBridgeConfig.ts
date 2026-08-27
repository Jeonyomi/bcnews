export type CandlePoint = { timestamp: number; value: number }
export type CandleSeries = { symbol: string; points: CandlePoint[] }

export type BreakingBridgeSnapshot = {
  observedAt: string
  es30: number | null
  nq30: number | null
  tnx30Bps: number | null
  dxy30: number | null
  krw30: number | null
  btc60: number | null
  eth60: number | null
}

export type BreakingSignalId =
  | 'RATE_SHOCK'
  | 'US_FUTURES_SHOCK'
  | 'FX_SHOCK'
  | 'CRYPTO_SHOCK'
  | 'RISK_DIVERGENCE'

export type BreakingSignal = {
  id: BreakingSignalId
  direction: string
  score: number
  label: string
  summary: string
}

const round = (value: number, decimals = 2) => {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

const normalizePoints = (symbol: string, points: CandlePoint[]): CandleSeries => {
  const valid = points
    .filter(({ timestamp, value }) => Number.isFinite(timestamp) && timestamp > 0 && Number.isFinite(value) && value > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
  if (valid.length < 2) throw new Error(`insufficient_candle_points:${symbol}`)
  return { symbol, points: valid }
}

export const parseYahooCandleSeries = (payload: any, symbol: string): CandleSeries => {
  const result = payload?.chart?.result?.[0]
  const timestamps = result?.timestamp
  const closes = result?.indicators?.quote?.[0]?.close
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) throw new Error(`invalid_yahoo_candles:${symbol}`)
  return normalizePoints(symbol, timestamps.map((timestamp: unknown, index: number) => ({
    timestamp: Number(timestamp),
    value: Number(closes[index]),
  })))
}

export const parseCoinbaseCandleSeries = (payload: any, symbol: string): CandleSeries => {
  if (!Array.isArray(payload)) throw new Error(`invalid_coinbase_candles:${symbol}`)
  return normalizePoints(symbol, payload.map((row: any) => ({
    timestamp: Number(row?.[0]),
    value: Number(row?.[4]),
  })))
}

export const calculateSeriesChange = (series: CandleSeries, lookbackMinutes: number) => {
  if (!Number.isFinite(lookbackMinutes) || lookbackMinutes <= 0) throw new Error('invalid_series_lookback')
  const latest = series.points[series.points.length - 1]
  const target = latest.timestamp - lookbackMinutes * 60
  const baseline = [...series.points].reverse().find((point) => point.timestamp <= target)
  if (!baseline) throw new Error(`insufficient_series_lookback:${series.symbol}:${lookbackMinutes}`)
  return round(((latest.value - baseline.value) / baseline.value) * 100)
}

const selectFreshWindow = (
  series: CandleSeries,
  lookbackMinutes: number,
  observedAt: string,
  maxAgeMinutes: number,
) => {
  const observedTimestamp = new Date(observedAt).getTime() / 1000
  if (!Number.isFinite(observedTimestamp)) throw new Error('invalid_breaking_bridge_observed_at')
  const sourceLatest = series.points[series.points.length - 1]
  if (sourceLatest.timestamp - observedTimestamp > 300) {
    throw new Error(`future_candle_timestamp:${series.symbol}`)
  }
  const latest = [...series.points].reverse().find((point) => point.timestamp + 5 * 60 <= observedTimestamp)
  if (!latest || observedTimestamp - latest.timestamp > maxAgeMinutes * 60) return null
  const target = latest.timestamp - lookbackMinutes * 60
  const baseline = [...series.points].reverse().find((point) => point.timestamp <= target)
  if (!baseline || target - baseline.timestamp > 5 * 60) return null
  return { latest, baseline }
}

export const calculateFreshSeriesChange = (
  series: CandleSeries,
  lookbackMinutes: number,
  observedAt: string,
  maxAgeMinutes: number,
) => {
  const window = selectFreshWindow(series, lookbackMinutes, observedAt, maxAgeMinutes)
  if (!window) return null
  return round(((window.latest.value - window.baseline.value) / window.baseline.value) * 100)
}

export const calculateFreshSeriesDelta = (
  series: CandleSeries,
  lookbackMinutes: number,
  observedAt: string,
  maxAgeMinutes: number,
  multiplier = 1,
) => {
  const window = selectFreshWindow(series, lookbackMinutes, observedAt, maxAgeMinutes)
  if (!window) return null
  return round((window.latest.value - window.baseline.value) * multiplier)
}

const signal = (
  id: BreakingSignalId,
  direction: string,
  score: number,
  label: string,
  summary: string,
): BreakingSignal => ({ id, direction, score: round(score), label, summary })

export const evaluateBreakingSignals = (snapshot: BreakingBridgeSnapshot): BreakingSignal[] => {
  const signals: BreakingSignal[] = []
  const futuresAverage = snapshot.es30 == null || snapshot.nq30 == null ? null : (snapshot.es30 + snapshot.nq30) / 2
  const cryptoAverage = snapshot.btc60 == null || snapshot.eth60 == null ? null : (snapshot.btc60 + snapshot.eth60) / 2

  if (snapshot.tnx30Bps != null && Math.abs(snapshot.tnx30Bps) >= 5) {
    signals.push(signal(
      'RATE_SHOCK', snapshot.tnx30Bps > 0 ? 'up' : 'down', Math.abs(snapshot.tnx30Bps) / 5,
      '미국 금리 급변', `미 10년물이 30분 동안 ${snapshot.tnx30Bps > 0 ? '상승' : '하락'}`,
    ))
  }
  if (futuresAverage != null && Math.abs(futuresAverage) >= 0.7) {
    signals.push(signal(
      'US_FUTURES_SHOCK', futuresAverage > 0 ? 'up' : 'down', Math.abs(futuresAverage) / 0.7,
      '미국 선물 급변', `ES·NQ 선물 평균이 30분 동안 ${futuresAverage > 0 ? '상승' : '하락'}`,
    ))
  }
  const dxyScore = snapshot.dxy30 == null ? 0 : Math.abs(snapshot.dxy30) / 0.4
  const krwScore = snapshot.krw30 == null ? 0 : Math.abs(snapshot.krw30) / 0.5
  if (dxyScore >= 1 || krwScore >= 1) {
    const primaryFx = dxyScore >= krwScore ? snapshot.dxy30! : snapshot.krw30!
    signals.push(signal(
      'FX_SHOCK', primaryFx > 0 ? 'up' : 'down', Math.max(dxyScore, krwScore),
      '달러·원화 급변', '달러지수 또는 원달러가 30분 기준 임계치를 돌파',
    ))
  }
  if (cryptoAverage != null && Math.abs(cryptoAverage) >= 2) {
    signals.push(signal(
      'CRYPTO_SHOCK', cryptoAverage > 0 ? 'up' : 'down', Math.abs(cryptoAverage) / 2,
      '크립토 급변', `BTC·ETH 평균이 60분 동안 ${cryptoAverage > 0 ? '상승' : '하락'}`,
    ))
  }
  const opposite = futuresAverage != null && cryptoAverage != null
    && ((futuresAverage >= 0.5 && cryptoAverage <= -0.8) || (futuresAverage <= -0.5 && cryptoAverage >= 0.8))
  if (opposite) {
    signals.push(signal(
      'RISK_DIVERGENCE',
      futuresAverage > 0 ? 'stocks_up_crypto_down' : 'stocks_down_crypto_up',
      Math.abs(futuresAverage - cryptoAverage) / 1.3,
      '주식·크립토 괴리',
      futuresAverage > 0 ? '미국 선물 강세와 크립토 약세가 동시 발생' : '미국 선물 약세와 크립토 강세가 동시 발생',
    ))
  }
  return signals
}

export const selectPrimarySignal = (signals: BreakingSignal[]) =>
  [...signals].sort((a, b) => b.score - a.score)[0] || null

export const buildBreakingBridgeDedupeKey = (signalValue: BreakingSignal, observedAt: string) => {
  const timestamp = new Date(observedAt).getTime()
  if (!Number.isFinite(timestamp)) throw new Error('invalid_breaking_bridge_observed_at')
  const bucket = new Date(Math.floor(timestamp / (2 * 60 * 60 * 1000)) * 2 * 60 * 60 * 1000)
    .toISOString().slice(0, 13)
  return `mbai_breaking_bridge:${signalValue.id.toLowerCase()}:${signalValue.direction}:${bucket}`
}

const escapeMarkdownV2 = (value: string) => value.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!])/g, '\\$1')
const signed = (value: number, decimals = 2) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(decimals)}`
const average = (a: number | null, b: number | null) => a == null || b == null ? null : round((a + b) / 2)
const metric = (value: number | null, suffix: string, decimals = 2) =>
  value == null ? '휴장/비활성' : `${signed(value, decimals)}${suffix}`

const formatKstMinute = (observedAt: string) => {
  const date = new Date(observedAt)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_breaking_bridge_observed_at')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

const narrative = (snapshot: BreakingBridgeSnapshot, primary: BreakingSignal) => {
  const futures = average(snapshot.es30, snapshot.nq30)
  const crypto = average(snapshot.btc60, snapshot.eth60)
  if (primary.id === 'RISK_DIVERGENCE') return {
    caught: `미국 선물 평균 ${signed(futures!)}% · BTC/ETH 평균 ${signed(crypto!)}%`,
    why: futures! > 0
      ? '위험선호가 시장 전체로 확산된 것이 아니라 미국 주식 선물에 집중된 흐름입니다. 크립토 약세가 지속되면 고베타 자산 전반의 추격 강도는 제한될 수 있습니다.'
      : '미국 주식 선물은 약세지만 크립토에는 상대적 매수세가 유입되고 있습니다. 다만 주식 위험회피가 확대되면 크립토의 독립 강세가 유지되는지 확인해야 합니다.',
    next: futures! > 0
      ? 'NASDAQ 선물 강세 유지와 BTC·ETH 60분 낙폭 축소 여부'
      : 'NASDAQ 선물 낙폭 축소와 BTC·ETH 상대강세 유지 여부',
  }
  if (primary.id === 'RATE_SHOCK') return {
    caught: `미 10년물 30분 ${signed(snapshot.tnx30Bps!, 1)}bp`,
    why: snapshot.tnx30Bps! > 0
      ? '금리 급등은 성장주와 크립토의 할인율 부담을 동시에 높입니다. NASDAQ 선물과 BTC가 함께 밀리는지 확인할 구간입니다.'
      : '금리 급락은 성장자산에 우호적이지만 경기 우려가 원인이라면 주식 반응이 제한될 수 있습니다.',
    next: '미 10년물 방향 지속과 NASDAQ 선물·BTC의 동행 여부',
  }
  if (primary.id === 'US_FUTURES_SHOCK') return {
    caught: `미국 선물 평균 30분 ${signed(futures!)}%`,
    why: futures! > 0
      ? '미국 주식 위험선호가 빠르게 강화되고 있습니다. 달러와 금리가 함께 오르면 성장주의 상승 지속력은 제한될 수 있습니다.'
      : '미국 선물의 급락은 한국 성장주와 크립토에도 위험회피 압력을 전달할 수 있습니다.',
    next: 'S&P·NASDAQ 선물 방향 유지와 금리·BTC 확인',
  }
  if (primary.id === 'FX_SHOCK') {
    const dxyScore = Math.abs(snapshot.dxy30 ?? 0) / 0.4
    const krwScore = Math.abs(snapshot.krw30 ?? 0) / 0.5
    const dxyLeads = dxyScore >= krwScore
    const driver = dxyLeads ? snapshot.dxy30! : snapshot.krw30!
    const why = dxyLeads
      ? (driver > 0
        ? '달러 강세가 빠르게 진행되면 글로벌 유동성과 성장자산에 부담이 될 수 있습니다. 원달러와 크립토가 같은 방향으로 반응하는지도 중요합니다.'
        : '달러 약세는 위험자산에 우호적이지만 미국 금리와 주식 선물이 함께 확인돼야 흐름의 지속성을 판단할 수 있습니다.')
      : (driver > 0
        ? '원화 약세가 빠르게 진행되면 외국인 수급과 한국 성장주에 부담이 될 수 있습니다. 달러 강세가 크립토 약세로 연결되는지도 중요합니다.'
        : '원화 강세는 외국인 수급에 우호적이지만 미국 금리와 달러 방향이 다시 반전하는지 확인해야 합니다.')
    return {
      caught: `달러지수 30분 ${metric(snapshot.dxy30, '%')} · USD/KRW ${metric(snapshot.krw30, '%')}`,
      why,
      next: dxyLeads ? '달러지수 임계치 유지와 NASDAQ 선물·BTC 반응' : 'USD/KRW 임계치 유지와 KOSPI 선물·BTC 반응',
    }
  }
  return {
    caught: `BTC/ETH 평균 60분 ${signed(crypto!)}%`,
    why: crypto! > 0
      ? '크립토의 급등은 고베타 위험선호 회복 신호일 수 있습니다. 미국 선물이 동행해야 시장 전체 확산으로 볼 수 있습니다.'
      : '크립토 급락은 레버리지 축소와 위험회피 신호일 수 있습니다. 미국 선물까지 동반 하락하면 파급 범위가 커집니다.',
    next: 'BTC·ETH 낙폭/상승폭 유지와 미국 선물 동행 여부',
  }
}

export const buildBreakingBridgeMessage = (snapshot: BreakingBridgeSnapshot, primary: BreakingSignal) => {
  const story = narrative(snapshot, primary)
  return [
    `🚨 *BREAKING BRIDGE \\| ${escapeMarkdownV2(primary.label)}*`,
    `기준 ${escapeMarkdownV2(formatKstMinute(snapshot.observedAt))} KST`,
    '',
    '⚡ *포착*',
    escapeMarkdownV2(story.caught),
    '',
    '📊 *시장 반응*',
    `ES 30분 ${escapeMarkdownV2(metric(snapshot.es30, '%'))} · NQ 30분 ${escapeMarkdownV2(metric(snapshot.nq30, '%'))}`,
    `미 10년물 30분 ${escapeMarkdownV2(metric(snapshot.tnx30Bps, 'bp', 1))}`,
    `달러지수 30분 ${escapeMarkdownV2(metric(snapshot.dxy30, '%'))} · USD/KRW 30분 ${escapeMarkdownV2(metric(snapshot.krw30, '%'))}`,
    `BTC 60분 ${escapeMarkdownV2(metric(snapshot.btc60, '%'))} · ETH 60분 ${escapeMarkdownV2(metric(snapshot.eth60, '%'))}`,
    '',
    '🔗 *왜 중요한가*',
    escapeMarkdownV2(story.why),
    '',
    '🎯 *다음 확인*',
    escapeMarkdownV2(story.next),
    '',
    '출처: Yahoo Finance · Coinbase',
  ].join('\n')
}
