/**
 * Daily required ASSET picks can share a source URL across sessions.
 * All other posts retain the existing article-URL duplicate protection.
 * @param {{ lane?: unknown, dedupe_key?: unknown, article_url?: unknown } | null | undefined} row
 */
export function buildChannelPostDuplicateFilter(row) {
  const key = String(row?.dedupe_key || '')
  const match = /^mbai_hot24:(\d{4}-\d{2}-\d{2}):(KOREA|US|CRYPTO):ASSET$/.exec(key)
  const time = match ? Date.parse(`${match[1]}T00:00:00.000Z`) : NaN
  const validDay = Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === match?.[1]
  if (row?.lane === 'mbai_hot24' && validDay) return `dedupe_key.eq.${key}`
  return `dedupe_key.eq.${key},article_url.eq.${String(row?.article_url || '')}`
}
