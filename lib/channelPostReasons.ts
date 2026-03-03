export const CHANNEL_POST_REASONS = {
  POSTED_AUTO: 'posted_auto',
  SKIPPED_DUPLICATE: 'skipped_duplicate',
  SKIPPED_INVALID_PAYLOAD: 'skipped_invalid_payload',
  FAILED_SEND: 'failed_send',

  // legacy reasons kept for backward-compatible analytics
  NOT_BREAKING_LANE: 'not_breaking_lane',
  SOURCE_NOT_ALLOWLISTED: 'source_not_allowlisted',
  POLICY_TIER_A_MED_OR_HIGH_ONLY: 'tier_a_med_or_high_only',
  POLICY_TIER_B_HIGH_ONLY: 'tier_b_high_only',
  DEDUPE_12H: 'dedupe_12h',
  DAILY_CAP: 'daily_cap',
  KR_TITLE_DOT_SPAM_GUARD: 'kr_title_dot_spam_guard',
  TELEGRAM_ERROR_PREFIX: 'telegram_error:',
} as const

export const CHANNEL_POST_REASON_VALUES = Object.values(CHANNEL_POST_REASONS)

export type ChannelPostReason = (typeof CHANNEL_POST_REASONS)[keyof typeof CHANNEL_POST_REASONS]

export const normalizeChannelPostReason = (reason: string | null | undefined) => {
  const r = String(reason || '').trim()
  if (!r) return 'unknown'
  if (r === CHANNEL_POST_REASONS.POSTED_AUTO) return 'posted_auto'
  if (r === CHANNEL_POST_REASONS.SKIPPED_DUPLICATE) return 'skipped_duplicate'
  if (r === CHANNEL_POST_REASONS.SKIPPED_INVALID_PAYLOAD) return 'skipped_invalid_payload'
  if (r === CHANNEL_POST_REASONS.FAILED_SEND || r.startsWith(CHANNEL_POST_REASONS.TELEGRAM_ERROR_PREFIX) || r.startsWith('failed_send:')) return 'failed_send'

  // legacy mapping
  if (r === CHANNEL_POST_REASONS.NOT_BREAKING_LANE) return 'skipped_not_breaking_lane'
  if (r === CHANNEL_POST_REASONS.SOURCE_NOT_ALLOWLISTED) return 'skipped_source_not_allowlisted'
  if (r === CHANNEL_POST_REASONS.POLICY_TIER_A_MED_OR_HIGH_ONLY || r === CHANNEL_POST_REASONS.POLICY_TIER_B_HIGH_ONLY) return 'skipped_policy_importance'
  if (r === CHANNEL_POST_REASONS.DEDUPE_12H) return 'skipped_policy_dedupe'
  if (r === CHANNEL_POST_REASONS.DAILY_CAP) return 'skipped_policy_daily_cap'
  if (r === CHANNEL_POST_REASONS.KR_TITLE_DOT_SPAM_GUARD) return 'skipped_format_kr_title_dot_spam'
  return 'other'
}
