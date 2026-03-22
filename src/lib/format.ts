/** Formatting helpers for Swedish UI text */

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
] as const

/**
 * Returns a human-readable relative time string in Swedish.
 *
 * - "just nu" for <1 min
 * - "X min sedan" for <1 hour
 * - "X tim sedan" for <24 hours
 * - "igår" for yesterday
 * - "X dagar sedan" for <7 days
 * - Otherwise: formatted date "22 mar 2026"
 */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just nu'
  if (diffMin < 60) return `${diffMin} min sedan`
  if (diffHours < 24) return `${diffHours} tim sedan`

  // Check if yesterday (calendar day, not just 24h ago)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'igår'
  }

  if (diffDays < 7) return `${diffDays} dagar sedan`

  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}
