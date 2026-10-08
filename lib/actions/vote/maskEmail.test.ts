import { describe, expect, test } from 'vitest'
import { displayVoterLabel, maskEmail } from './maskEmail'

describe('maskEmail', () => {
  test('hides about 70% of characters', () => {
    const email = 'abcdefghij@example.com' // 22 chars → ~7 visible
    const masked = maskEmail(email)
    const stars = (masked.match(/\*/g) || []).length
    expect(stars).toBeGreaterThanOrEqual(Math.floor(email.length * 0.6))
    expect(masked.length).toBe(email.length)
    expect(masked.startsWith('a')).toBe(true)
  })

  test('displayVoterLabel prefers nickname over email', () => {
    expect(
      displayVoterLabel({ nickname: 'Ada', voterEmail: 'ada@x.com' })
    ).toBe('Ada')
    expect(
      displayVoterLabel({ nickname: null, voterEmail: 'ada@example.com' })
    ).toContain('*')
  })
})
