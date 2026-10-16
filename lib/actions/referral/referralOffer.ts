import type Stripe from 'stripe'
import { prisma } from '@/lib/db'
import { PaymentType } from '@prisma/client'
import {
  normalizeBuyerEmail,
  normalizeReferralCode,
} from '@/lib/actions/referral/referralCode'
import { isBeforeDeadline } from '@/lib/actions/referral/pacificTime'

const EXCLUDED_PAYMENT_TYPES: PaymentType[] = [
  PaymentType.Membership,
  PaymentType.Shop,
  PaymentType.Refund,
]

export async function getEventReferralDiscountPercent(eventId: string): Promise<number> {
  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId },
    select: { isEnabled: true, endsAt: true, referralDiscountPercent: true },
  })
  if (!challenge?.isEnabled || challenge.referralDiscountPercent <= 0) return 0
  if (!isBeforeDeadline(challenge.endsAt)) return 0
  return challenge.referralDiscountPercent
}

export async function getActiveReferralDiscount(input: {
  eventId: string
  code?: string | null
  buyerEmail?: string | null
  now?: Date
}): Promise<{ percent: number; code: string } | null> {
  const code = normalizeReferralCode(input.code)
  if (!code || !input.eventId) return null

  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId: input.eventId },
    select: {
      isEnabled: true,
      endsAt: true,
      referralDiscountPercent: true,
    },
  })
  if (!challenge?.isEnabled) return null
  if (challenge.referralDiscountPercent <= 0) return null
  if (!isBeforeDeadline(challenge.endsAt, input.now)) return null

  const referral = await prisma.ticketReferral.findFirst({
    where: { code, eventId: input.eventId },
    select: { ownerEmail: true },
  })
  if (!referral) return null

  const buyerEmail = normalizeBuyerEmail(input.buyerEmail)
  if (buyerEmail && buyerEmail === referral.ownerEmail) return null

  return { percent: challenge.referralDiscountPercent, code }
}

export async function priceWithReferralDiscount(
  stripe: Stripe,
  priceId: string,
  percent: number,
  cache: Map<string, string>
): Promise<string> {
  const cached = cache.get(priceId)
  if (cached) return cached
  if (percent <= 0) {
    cache.set(priceId, priceId)
    return priceId
  }

  const price = await stripe.prices.retrieve(priceId)
  const amount = price.unit_amount || 0
  const discounted = Math.max(0, Math.round((amount * (100 - percent)) / 100))
  if (discounted === amount || !price.product) {
    cache.set(priceId, priceId)
    return priceId
  }

  const product = typeof price.product === 'string' ? price.product : price.product.id
  const created = await stripe.prices.create({
    unit_amount: discounted,
    currency: price.currency,
    product,
    metadata: {
      originalPriceId: priceId,
      discountType: 'referral',
      referralDiscountPercent: String(percent),
    },
  })
  const nextId = created.id
  cache.set(priceId, nextId)
  return nextId
}

export async function isEligibleForReferralCode(input: {
  eventId: string
  userId: string
  email: string
}): Promise<boolean> {
  const email = normalizeBuyerEmail(input.email)
  if (!email) return false

  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId: input.eventId },
    select: { performerEmails: true, isEnabled: true },
  })
  if (!challenge?.isEnabled) return false
  if (challenge.performerEmails.includes(email)) return true

  const [user, payment, application] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { subscribedAt: true, subscribeExpires: true },
    }),
    prisma.payment.findFirst({
      where: {
        eventId: input.eventId,
        refunded: false,
        type: { notIn: EXCLUDED_PAYMENT_TYPES },
        OR: [
          { userId: input.userId },
          { guestEmail: { equals: email, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    }),
    prisma.application.findFirst({
      where: { userId: input.userId, job: { eventId: input.eventId } },
      select: { id: true },
    }),
  ])

  if (payment || application) return true
  if (!user?.subscribedAt || !user.subscribeExpires) return false
  const now = new Date()
  return now >= user.subscribedAt && now <= user.subscribeExpires
}
