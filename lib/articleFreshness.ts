export const normalizePublicationDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null

  const publishedMs = Date.parse(value)
  if (!Number.isFinite(publishedMs)) return null
  return new Date(publishedMs).toISOString()
}

export const isWithinAgeHours = (
  publishedAt: string | null | undefined,
  maxAgeHours: number,
  nowMs = Date.now(),
) => {
  const normalizedPublishedAt = normalizePublicationDate(publishedAt)
  if (!normalizedPublishedAt || !Number.isFinite(nowMs)) return false
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) return false
  const ageMs = nowMs - Date.parse(normalizedPublishedAt)
  return ageMs >= 0 && ageMs <= maxAgeHours * 60 * 60 * 1000
}
