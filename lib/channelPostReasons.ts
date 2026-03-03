export const CHANNEL_POST_REASONS = {
  POSTED_AUTO: 'posted_auto',
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
