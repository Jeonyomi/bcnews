const SEOUL_TZ = 'Asia/Seoul'

export const formatSeoulDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TZ,
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))

export const formatSeoulTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL_TZ,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(value))

