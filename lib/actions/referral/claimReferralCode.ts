'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { buildTicketReferralLink } from '@/lib/actions/referral/referralCode'
import { getOrCreateTicketReferral } from '@/lib/actions/referral/ticketReferral'
import { isEligibleForReferralCode } from '@/lib/actions/referral/referralOffer'
import { isBeforeDeadline } from '@/lib/actions/referral/pacificTime'
import { normalizeBuyerEmail } from '@/lib/actions/referral/referralCode'

export type ClaimReferralResult =
  | { ok: true; code: string; link: string; ended: boolean }
  | { ok: false; reason: 'login' | 'ineligible' | 'unavailable' | 'ended' }

export async function claimReferralCode(eventId: string): Promise<ClaimReferralResult> {
  const session = await auth()
  const userId = session?.user?.id
  const email = normalizeBuyerEmail(session?.user?.email)
  if (!userId || !email) return { ok: false, reason: 'login' }

  const [event, challenge] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, keyName: true, eventType: true },
    }),
    prisma.eventGroupChallenge.findUnique({
      where: { eventId },
      select: { isEnabled: true, endsAt: true },
    }),
  ])
  if (!event || !challenge?.isEnabled) return { ok: false, reason: 'unavailable' }

  const ended = !isBeforeDeadline(challenge.endsAt)
  const existing = await prisma.ticketReferral.findUnique({
    where: { eventId_ownerEmail: { eventId, ownerEmail: email } },
    select: { code: true },
  })
  if (existing) {
    return {
      ok: true,
      code: existing.code,
      ended,
      link: buildTicketReferralLink({
        eventKeyName: event.keyName,
        eventType: event.eventType,
        code: existing.code,
      }),
    }
  }
  if (ended) return { ok: false, reason: 'ended' }

  const eligible = await isEligibleForReferralCode({ eventId, userId, email })
  if (!eligible) return { ok: false, reason: 'ineligible' }

  const referral = await getOrCreateTicketReferral({
    eventId,
    ownerEmail: email,
    ownerName: session?.user?.name,
    userId,
  })

  return {
    ok: true,
    code: referral.code,
    ended: false,
    link: buildTicketReferralLink({
      eventKeyName: event.keyName,
      eventType: event.eventType,
      code: referral.code,
    }),
  }
}
