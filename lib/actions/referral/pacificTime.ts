import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const PACIFIC_TIME_ZONE = 'America/Vancouver'

export function parsePacificDateTimeLocal(value: string): Date | null {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return null
  const date = fromZonedTime(trimmed, PACIFIC_TIME_ZONE)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatPacificDateTimeLocal(
  value: Date | string | null | undefined
): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatInTimeZone(date, PACIFIC_TIME_ZONE, "yyyy-MM-dd'T'HH:mm")
}

export function formatPacificDisplay(value: Date | string): string {
  return formatInTimeZone(new Date(value), PACIFIC_TIME_ZONE, 'MMM d, yyyy, h:mm a zzz')
}

export function isBeforeDeadline(
  endsAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!endsAt) return true
  const end = new Date(endsAt)
  if (Number.isNaN(end.getTime())) return true
  return now.getTime() <= end.getTime()
}
