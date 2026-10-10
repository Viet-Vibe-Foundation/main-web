import { describe, expect, test } from 'vitest'
import {
  getVotingWindowStatus,
  isVotingOpen,
} from './votingWindow'

describe('votingWindow', () => {
  const now = new Date('2026-10-08T15:00:00.000Z')

  test('unscheduled window is treated as open', () => {
    expect(getVotingWindowStatus(null, null, now)).toBe('unscheduled')
    expect(isVotingOpen(null, null, now)).toBe(true)
  })

  test('upcoming before start', () => {
    expect(
      getVotingWindowStatus('2026-10-09T00:00:00.000Z', null, now)
    ).toBe('upcoming')
    expect(isVotingOpen('2026-10-09T00:00:00.000Z', null, now)).toBe(false)
  })

  test('open inside window', () => {
    expect(
      getVotingWindowStatus(
        '2026-10-01T00:00:00.000Z',
        '2026-10-10T00:00:00.000Z',
        now
      )
    ).toBe('open')
    expect(
      isVotingOpen(
        '2026-10-01T00:00:00.000Z',
        '2026-10-10T00:00:00.000Z',
        now
      )
    ).toBe(true)
  })

  test('closed after end', () => {
    expect(
      getVotingWindowStatus(null, '2026-10-07T00:00:00.000Z', now)
    ).toBe('closed')
    expect(isVotingOpen(null, '2026-10-07T00:00:00.000Z', now)).toBe(false)
  })
})
