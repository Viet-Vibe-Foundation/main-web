import { describe, expect, test } from 'vitest'
import { rankReferralStats } from './rankReferralStats'

describe('rankReferralStats', () => {
  test('puts the person with the most referral orders first', () => {
    const ranked = rankReferralStats([
      {
        name: 'Lan Pham',
        email: 'lan@example.com',
        code: 'AAAA1111',
        referralCount: 1,
        referredTickets: 8,
        referredBuyers: [],
      },
      {
        name: 'Minh Tran',
        email: 'minh@example.com',
        code: 'BBBB2222',
        referralCount: 4,
        referredTickets: 4,
        referredBuyers: [],
      },
      {
        name: 'An Le',
        email: 'an@example.com',
        code: 'CCCC3333',
        referralCount: 0,
        referredTickets: 0,
        referredBuyers: [],
      },
    ])

    expect(ranked.map((row) => row.name)).toEqual(['Minh Tran', 'Lan Pham'])
    expect(ranked[0]?.rank).toBe(1)
    expect(ranked[0]?.referralCount).toBe(4)
  })
})
