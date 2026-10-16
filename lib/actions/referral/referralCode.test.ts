import { describe, expect, test } from 'vitest'
import {
  buildTicketReferralLink,
  generateReferralCode,
  normalizeReferralCode,
  sumCheckoutTicketQuantity,
} from './referralCode'

describe('referral codes', () => {
  test('normalizes a shared code and rejects junk', () => {
    expect(normalizeReferralCode(' ab12-cd ')).toBe('AB12CD')
    expect(normalizeReferralCode('???')).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
  })

  test('generates an 8 character code from the safe alphabet', () => {
    const code = generateReferralCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  test('builds a personal event link', () => {
    process.env.NEXT_PUBLIC_BASE_URL = 'https://www.vietvibe.org'
    expect(
      buildTicketReferralLink({
        eventKeyName: 'friday-chill',
        eventType: 'CONCERT',
        code: 'AB12CD34',
        locale: 'vi',
      })
    ).toBe('https://www.vietvibe.org/vi/events/concert/friday-chill?ref=AB12CD34')
  })

  test('sums seated and open tickets in one checkout', () => {
    expect(
      sumCheckoutTicketQuantity([
        { seatNumbers: ['A1', 'A2'] },
        { seatNumbers: [], quantity: 3 },
      ])
    ).toBe(5)
    expect(sumCheckoutTicketQuantity(null, 2)).toBe(2)
  })
})
