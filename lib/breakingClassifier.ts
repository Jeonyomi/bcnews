import { BREAKING_KEYWORDS } from '@/lib/dashboardFeedConfig'

export const isBreakingLane = (args: {
  title?: string | null
  summary?: string | null
  why?: string | null
  importanceLabel?: string | null
}) => {
  const text = `${args.title || ''} ${args.summary || ''} ${args.why || ''}`.toLowerCase()
  const importance = String(args.importanceLabel || '').toUpperCase()
  if (importance === 'HIGH') return true
  return BREAKING_KEYWORDS.some((k) => text.includes(k))
}
