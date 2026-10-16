import { maskBuyerName } from '@/lib/actions/referral/maskBuyerName'

export type ChallengeGroupInput = {
  ownerEmail: string
  ownerName: string
  ownQuantity: number
  referrals: { email: string; name: string; quantity: number }[]
}

export type RankedChallengeGroup = {
  rank: number
  displayName: string
  score: number
  members: { displayName: string }[]
}

export function rankChallengeGroups(
  groups: ChallengeGroupInput[],
  limit = 20,
  options?: { countOwnTickets?: boolean }
): RankedChallengeGroup[] {
  const countOwnTickets = options?.countOwnTickets === true
  const ranked = groups
    .map((group) => {
      const ownerEmail = group.ownerEmail.trim().toLowerCase()
      const referredByEmail = new Map<string, { name: string; quantity: number }>()

      for (const referral of group.referrals) {
        const email = referral.email.trim().toLowerCase()
        if (!email || email === ownerEmail) continue
        const quantity = Math.max(0, referral.quantity)
        const existing = referredByEmail.get(email)
        if (existing) {
          existing.quantity += quantity
          if (!existing.name && referral.name) existing.name = referral.name
        } else {
          referredByEmail.set(email, {
            name: referral.name,
            quantity,
          })
        }
      }

      const referred = [...referredByEmail.values()]
      const referredQuantity = referred.reduce((sum, member) => sum + member.quantity, 0)
      const ownQuantity = Math.max(0, group.ownQuantity)

      return {
        ownerName: group.ownerName,
        score: (countOwnTickets ? ownQuantity : 0) + referredQuantity,
        members: [
          ...(countOwnTickets
            ? [{ displayName: maskBuyerName(group.ownerName) }]
            : []),
          ...referred.map((member) => ({
            displayName: maskBuyerName(member.name),
          })),
        ],
      }
    })
    .filter((group) => group.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.ownerName.localeCompare(b.ownerName)
    )
    .slice(0, limit)

  return ranked.map((group, index) => ({
    rank: index + 1,
    displayName: maskBuyerName(group.ownerName),
    score: group.score,
    members: group.members,
  }))
}
