import { timingSafeEqual } from 'node:crypto'

// Operator-only bearer credential. Never reuse cron secrets or expose this in browser bundles.
// No admin session/role infrastructure exists in this app; absent configuration denies access.
export const isChannelPostsAdmin = (request: Request) => {
  const expected = process.env.CHANNEL_POSTS_ADMIN_TOKEN
  const authorization = request.headers.get('authorization') || ''
  if (!expected || !authorization.startsWith('Bearer ')) return false
  const actual = Buffer.from(authorization.slice(7))
  const configured = Buffer.from(expected)
  return actual.length === configured.length && timingSafeEqual(actual, configured)
}

export const CHANNEL_POSTS_ADMIN_ACTOR = 'channel-posts-admin'
