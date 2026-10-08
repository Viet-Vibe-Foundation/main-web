export type VotingWindowStatus = 'upcoming' | 'open' | 'closed' | 'unscheduled'

export function getVotingWindowStatus(
  votingStartsAt: Date | string | null | undefined,
  votingEndsAt: Date | string | null | undefined,
  now: Date = new Date()
): VotingWindowStatus {
  const start = votingStartsAt ? new Date(votingStartsAt) : null
  const end = votingEndsAt ? new Date(votingEndsAt) : null

  if (!start && !end) return 'unscheduled'
  if (start && now < start) return 'upcoming'
  if (end && now > end) return 'closed'
  return 'open'
}

export function isVotingOpen(
  votingStartsAt: Date | string | null | undefined,
  votingEndsAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const status = getVotingWindowStatus(votingStartsAt, votingEndsAt, now)
  return status === 'open' || status === 'unscheduled'
}

export function formatVotingWindowLabel(
  votingStartsAt: Date | string | null | undefined,
  votingEndsAt: Date | string | null | undefined
): string {
  const fmt = (value: Date | string) =>
    new Date(value).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (votingStartsAt && votingEndsAt) {
    return `${fmt(votingStartsAt)} – ${fmt(votingEndsAt)}`
  }
  if (votingStartsAt) return `From ${fmt(votingStartsAt)}`
  if (votingEndsAt) return `Until ${fmt(votingEndsAt)}`
  return 'No schedule set (voting always open while enabled)'
}

/** Convert datetime-local input value to Date, or null if empty. */
export function parseDatetimeLocal(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Format a Date for <input type="datetime-local" /> */
export function toDatetimeLocalValue(
  value: Date | string | null | undefined
): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
