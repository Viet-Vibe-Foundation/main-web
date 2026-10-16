import { describe, expect, test } from 'vitest'
import { rankChallengeGroups } from './rankChallengeGroups'

describe('rankChallengeGroups', () => {
  test('ranks groups by own tickets plus referred tickets and masks names', () => {
    const ranked = rankChallengeGroups([
      {
        ownerEmail: 'lan@example.com',
        ownerName: 'Lan Pham',
        ownQuantity: 1,
        referrals: [
          { email: 'minh@example.com', name: 'Minh Tran', quantity: 2 },
        ],
      },
      {
        ownerEmail: 'minh@example.com',
        ownerName: 'Minh Tran',
        ownQuantity: 2,
        referrals: [],
      },
    ], 20, { countOwnTickets: true })

    expect(ranked.map((group) => group.score)).toEqual([3, 2])
    expect(ranked[0]?.displayName).toBe('L*n P**m')
    expect(ranked[0]?.members.map((member) => member.displayName)).toEqual([
      'L*n P**m',
      'M**h T**n',
    ])
    expect(ranked[0]?.rank).toBe(1)
    expect(ranked[1]?.displayName).toBe('M**h T**n')
  })

  test('counts only tickets bought with the code unless own tickets are included', () => {
    const ranked = rankChallengeGroups([
      {
        ownerEmail: 'lan@example.com',
        ownerName: 'Lan Pham',
        ownQuantity: 5,
        referrals: [
          { email: 'minh@example.com', name: 'Minh Tran', quantity: 2 },
        ],
      },
      {
        ownerEmail: 'minh@example.com',
        ownerName: 'Minh Tran',
        ownQuantity: 9,
        referrals: [],
      },
    ])

    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.score).toBe(2)
    expect(ranked[0]?.members.map((member) => member.displayName)).toEqual(['M**h T**n'])
  })

  test('ignores a buyer referring themselves and drops empty groups', () => {
    const ranked = rankChallengeGroups([
      {
        ownerEmail: 'lan@example.com',
        ownerName: 'Lan',
        ownQuantity: 0,
        referrals: [{ email: 'lan@example.com', name: 'Lan', quantity: 4 }],
      },
    ])
    expect(ranked).toEqual([])
  })
})
