export const stripHtml = (value: string): string => {
  if (!value) return ''

  const withEntities = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>\s][^>]*$/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&nbsp/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#(?:x[a-fA-F0-9]{1,6}|[0-9]{1,7});/g, (match) => {
      const token = match.slice(2, -1)
      const code = token.toLowerCase().startsWith('x')
        ? Number.parseInt(token.slice(1), 16)
        : Number.parseInt(token, 10)
      if (!Number.isFinite(code)) return match
      return String.fromCodePoint(code)
    })
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')

  return withEntities.trim()
}
