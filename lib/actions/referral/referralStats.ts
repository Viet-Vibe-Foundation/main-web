'use server'

import { prisma } from '@/lib/db'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'
import { rankReferralStats } from '@/lib/actions/referral/rankReferralStats'
import type { ReferralStatRow } from '@/lib/actions/referral/rankReferralStats'

export async function getEventReferralStats(
  eventId: string
): Promise<ReferralStatRow[] | null> {
  if (!(await canAccessEventPaymentData(eventId))) return null

  const referrals = await prisma.ticketReferral.findMany({
    where: { eventId },
    include: {
      uses: {
        where: { payment: { refunded: false } },
        select: {
          buyerName: true,
          buyerEmail: true,
          quantity: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return rankReferralStats(
    referrals.map((referral) => ({
      name: referral.ownerName?.trim() || referral.ownerEmail,
      email: referral.ownerEmail,
      code: referral.code,
      referralCount: referral.uses.length,
      referredTickets: referral.uses.reduce(
        (sum, use) => sum + use.quantity,
        0
      ),
      referredBuyers: referral.uses.map((use) => ({
        name: use.buyerName?.trim() || use.buyerEmail,
        email: use.buyerEmail,
        quantity: use.quantity,
      })),
    }))
  )
}
