'use server'

import { prisma } from '@/lib/db'
import { revalidateTag } from 'next/cache'
import { PaymentType } from '@prisma/client'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'
import { normalizeBuyerEmail } from '@/lib/actions/referral/referralCode'
import {
  rankChallengeGroups,
  type RankedChallengeGroup,
} from '@/lib/actions/referral/rankChallengeGroups'
import {
  formatPacificDateTimeLocal,
  formatPacificDisplay,
  isBeforeDeadline,
  parsePacificDateTimeLocal,
} from '@/lib/actions/referral/pacificTime'

export type GroupChallengeReward = {
  place: number
  title: string
  description: string
  imageUrl: string
}

export type PublicGroupChallenge = {
  title: string
  description: string | null
  rewards: GroupChallengeReward[]
  groups: RankedChallengeGroup[]
  endsAt: Date | null
  endsAtLabel: string | null
  ended: boolean
  referralDiscountPercent: number
  countOwnTickets: boolean
}

const EXCLUDED_PAYMENT_TYPES: PaymentType[] = [
  PaymentType.Membership,
  PaymentType.Shop,
  PaymentType.Refund,
]

function cleanHttpUrl(value?: string | null): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) return ''
  return trimmed
}

export function parseChallengeRewards(value: unknown): GroupChallengeReward[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const reward = item as Record<string, unknown>
      const title = typeof reward.title === 'string' ? reward.title.trim() : ''
      const place = Number(reward.place)
      if (!title || !Number.isFinite(place) || place < 1) return null
      return {
        place: Math.floor(place),
        title: title.slice(0, 120),
        description:
          typeof reward.description === 'string'
            ? reward.description.trim().slice(0, 400)
            : '',
        imageUrl: cleanHttpUrl(
          typeof reward.imageUrl === 'string' ? reward.imageUrl : ''
        ),
      }
    })
    .filter((reward): reward is GroupChallengeReward => reward !== null)
    .sort((a, b) => a.place - b.place)
    .slice(0, 8)
}

export async function getPublicGroupChallenge(
  eventId: string
): Promise<PublicGroupChallenge | null> {
  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId },
  })
  if (!challenge?.isEnabled) return null

  const [referrals, payments] = await Promise.all([
    prisma.ticketReferral.findMany({
      where: { eventId },
      include: {
        uses: {
          where: { payment: { refunded: false } },
          select: {
            buyerEmail: true,
            buyerName: true,
            quantity: true,
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: {
        eventId,
        refunded: false,
        type: { notIn: EXCLUDED_PAYMENT_TYPES },
      },
      select: {
        quantity: true,
        guestEmail: true,
        guestName: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ])

  const ownTickets = new Map<string, { quantity: number; name: string }>()
  for (const payment of payments) {
    const email = normalizeBuyerEmail(payment.guestEmail || payment.user?.email)
    if (!email) continue
    const current = ownTickets.get(email) ?? {
      quantity: 0,
      name: payment.guestName || payment.user?.name || '',
    }
    current.quantity += payment.quantity
    if (!current.name) {
      current.name = payment.guestName || payment.user?.name || ''
    }
    ownTickets.set(email, current)
  }

  const groups = referrals.map((referral) => {
    const owned = ownTickets.get(referral.ownerEmail)
    return {
      ownerEmail: referral.ownerEmail,
      ownerName: referral.ownerName || owned?.name || 'Guest',
      ownQuantity: owned?.quantity ?? 0,
      referrals: referral.uses.map((use) => ({
        email: use.buyerEmail,
        name: use.buyerName || 'Guest',
        quantity: use.quantity,
      })),
    }
  })

  const ended = !isBeforeDeadline(challenge.endsAt)

  return {
    title: challenge.title,
    description: challenge.description,
    rewards: parseChallengeRewards(challenge.rewards),
    groups: rankChallengeGroups(groups, 20, {
      countOwnTickets: challenge.countOwnTickets,
    }),
    endsAt: challenge.endsAt,
    endsAtLabel: challenge.endsAt ? formatPacificDisplay(challenge.endsAt) : null,
    ended,
    referralDiscountPercent: challenge.referralDiscountPercent,
    countOwnTickets: challenge.countOwnTickets,
  }
}

export async function getGroupChallengeForAdmin(eventId: string) {
  if (!(await canAccessEventPaymentData(eventId))) return null
  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId },
  })
  if (!challenge) return null
  return {
    isEnabled: challenge.isEnabled,
    title: challenge.title,
    description: challenge.description || '',
    rewards: parseChallengeRewards(challenge.rewards),
    endsAt: formatPacificDateTimeLocal(challenge.endsAt),
    referralDiscountPercent: challenge.referralDiscountPercent,
    countOwnTickets: challenge.countOwnTickets,
    performerEmails: challenge.performerEmails.join('\n'),
  }
}

function parsePerformerEmails(raw: string): string[] {
  const emails = raw
    .split(/[\s,;]+/)
    .map((email) => normalizeBuyerEmail(email))
    .filter((email): email is string => Boolean(email))
  return [...new Set(emails)].slice(0, 200)
}

export async function saveGroupChallenge(input: {
  eventId: string
  isEnabled: boolean
  title: string
  description?: string
  rewards: GroupChallengeReward[]
  endsAt?: string
  referralDiscountPercent?: number
  countOwnTickets?: boolean
  performerEmails?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canAccessEventPaymentData(input.eventId))) {
    return { ok: false, error: 'You do not have access to this event' }
  }

  const title = input.title.trim() || 'Group Challenge'
  if (title.length > 80) {
    return { ok: false, error: 'Title is too long' }
  }
  const description = input.description?.trim() || null
  if (description && description.length > 4000) {
    return { ok: false, error: 'Description is too long' }
  }

  const invalidReward = input.rewards.some((reward) => {
    const title = reward.title.trim()
    const hasContent = Boolean(title || reward.description.trim() || reward.imageUrl.trim())
    if (!hasContent) return false
    return !title || !Number.isFinite(reward.place) || reward.place < 1
  })
  if (invalidReward) {
    return { ok: false, error: 'Each reward needs a place and a title' }
  }

  const rewards = parseChallengeRewards(input.rewards)
  const endsAt = input.endsAt?.trim()
    ? parsePacificDateTimeLocal(input.endsAt)
    : null
  if (input.endsAt?.trim() && !endsAt) {
    return { ok: false, error: 'End time must be a valid date' }
  }
  const referralDiscountPercent = Math.min(
    100,
    Math.max(0, Math.round(input.referralDiscountPercent || 0))
  )
  const performerEmails = parsePerformerEmails(input.performerEmails || '')
  const rules = {
    endsAt,
    referralDiscountPercent,
    countOwnTickets: input.countOwnTickets === true,
    performerEmails,
  }

  await prisma.eventGroupChallenge.upsert({
    where: { eventId: input.eventId },
    create: {
      eventId: input.eventId,
      isEnabled: input.isEnabled,
      title,
      description,
      rewards,
      ...rules,
    },
    update: {
      isEnabled: input.isEnabled,
      title,
      description,
      rewards,
      ...rules,
    },
  })

  revalidateTag('events')
  return { ok: true }
}
