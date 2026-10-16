import { describe, expect, test } from 'vitest'
import {
  formatPacificDateTimeLocal,
  isBeforeDeadline,
  parsePacificDateTimeLocal,
} from './pacificTime'

describe('Pacific challenge deadline', () => {
  test('stores 5:00 PM Pacific on Oct 25, 2026 as midnight UTC the next day', () => {
    const endsAt = parsePacificDateTimeLocal('2026-10-25T17:00')
    expect(endsAt?.toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(formatPacificDateTimeLocal(endsAt)).toBe('2026-10-25T17:00')
  })

  test('closes referrals after the deadline', () => {
    const endsAt = parsePacificDateTimeLocal('2026-10-25T17:00')!
    expect(isBeforeDeadline(endsAt, new Date('2026-10-25T23:59:00.000Z'))).toBe(true)
    expect(isBeforeDeadline(endsAt, new Date('2026-10-26T00:00:01.000Z'))).toBe(false)
    expect(isBeforeDeadline(null, new Date('2026-10-26T00:00:01.000Z'))).toBe(true)
  })
})