export type ReferredBuyer = {
  name: string
  email: string
  quantity: number
}

export type ReferralStatInput = {
  name: string
  email: string
  code: string
  referralCount: number
  referredTickets: number
  referredBuyers: ReferredBuyer[]
}

export type ReferralStatRow = ReferralStatInput & {
  rank: number
}

/** Rank referrers by number of successful referral orders, then tickets. */
export function rankReferralStats(rows: ReferralStatInput[]): ReferralStatRow[] {
  return [...rows]
    .filter((row) => row.referralCount > 0)
    .sort(
      (a, b) =>
        b.referralCount - a.referralCount ||
        b.referredTickets - a.referredTickets ||
        a.name.localeCompare(b.name)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }))
}
