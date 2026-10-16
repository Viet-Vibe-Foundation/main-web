import { prisma } from '@/lib/db'
import {
  buildTicketReferralLink,
  generateReferralCode,
  normalizeBuyerEmail,
  normalizeReferralCode,
} from '@/lib/actions/referral/referralCode'
import { isBeforeDeadline } from '@/lib/actions/referral/pacificTime'

export type ReferralShare = {
  code: string
  link: string
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  )
}

export async function getOrCreateTicketReferral(input: {
  eventId: string
  ownerEmail: string
  ownerName?: string | null
  userId?: string | null
  paymentId?: string | null
}): Promise<{ code: string }> {
  const ownerEmail = normalizeBuyerEmail(input.ownerEmail)
  if (!ownerEmail) {
    throw new Error('A valid buyer email is required to create a referral code')
  }

  const existing = await prisma.ticketReferral.findUnique({
    where: {
      eventId_ownerEmail: { eventId: input.eventId, ownerEmail },
    },
  })

  if (existing) {
    const data: {
      ownerName?: string
      userId?: string
      paymentId?: string
    } = {}
    if (!existing.ownerName && input.ownerName?.trim()) {
      data.ownerName = input.ownerName.trim()
    }
    if (!existing.userId && input.userId) data.userId = input.userId
    if (!existing.paymentId && input.paymentId) data.paymentId = input.paymentId
    if (Object.keys(data).length > 0) {
      await prisma.ticketReferral.update({
        where: { id: existing.id },
        data,
      })
    }
    return { code: existing.code }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.ticketReferral.create({
        data: {
          code: generateReferralCode(),
          eventId: input.eventId,
          ownerEmail,
          ownerName: input.ownerName?.trim() || null,
          userId: input.userId || null,
          paymentId: input.paymentId || null,
        },
      })
      return { code: created.code }
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error
      const raced = await prisma.ticketReferral.findUnique({
        where: {
          eventId_ownerEmail: { eventId: input.eventId, ownerEmail },
        },
      })
      if (raced) return { code: raced.code }
    }
  }

  throw new Error('Failed to create a referral code')
}

export async function settleCheckoutReferrals(input: {
  eventId: string
  eventKeyName: string
  eventType: string
  buyerEmail: string
  buyerName?: string | null
  userId?: string | null
  paymentId: string
  quantity: number
  referralCode?: string | null
  locale?: string
  extraRecipients?: { email: string; name?: string | null }[]
}): Promise<Map<string, ReferralShare>> {
  const shares = new Map<string, ReferralShare>()
  const buyerEmail = normalizeBuyerEmail(input.buyerEmail)
  if (!buyerEmail) return shares

  const incomingCode = normalizeReferralCode(input.referralCode)
  const challenge = await prisma.eventGroupChallenge.findUnique({
    where: { eventId: input.eventId },
    select: { endsAt: true },
  })
  const challengeOpen = isBeforeDeadline(challenge?.endsAt)
  if (incomingCode && challengeOpen) {
    const referrer = await prisma.ticketReferral.findFirst({
      where: { code: incomingCode, eventId: input.eventId },
    })
    if (referrer && referrer.ownerEmail !== buyerEmail) {
      try {
        await prisma.ticketReferralUse.create({
          data: {
            referralId: referrer.id,
            paymentId: input.paymentId,
            buyerEmail,
            buyerName: input.buyerName?.trim() || null,
            quantity: Math.max(1, input.quantity || 1),
          },
        })
      } catch (error) {
        if (!isUniqueConstraint(error)) throw error
      }
    }
  }

  const recipients = [
    {
      email: buyerEmail,
      name: input.buyerName,
      userId: input.userId ?? null,
    },
    ...(input.extraRecipients ?? []).map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      userId: null as string | null,
    })),
  ]

  const seen = new Set<string>()
  for (const recipient of recipients) {
    const email = normalizeBuyerEmail(recipient.email)
    if (!email || seen.has(email)) continue
    seen.add(email)

    const referral = await getOrCreateTicketReferral({
      eventId: input.eventId,
      ownerEmail: email,
      ownerName: recipient.name,
      userId: email === buyerEmail ? recipient.userId : null,
      paymentId: input.paymentId,
    })

    shares.set(email, {
      code: referral.code,
      link: buildTicketReferralLink({
        eventKeyName: input.eventKeyName,
        eventType: input.eventType,
        code: referral.code,
        locale: input.locale || 'en',
      }),
    })
  }

  return shares
}

export async function getReferralShareForSuccess(input: {
  eventKeyName: string
  stripeSessionId?: string | null
  locale: string
  userEmail?: string | null
  userName?: string | null
  userId?: string | null
}): Promise<ReferralShare | null> {
  const event = await prisma.event.findUnique({
    where: { keyName: input.eventKeyName },
    select: { id: true, keyName: true, eventType: true },
  })
  if (!event) return null

  let email = normalizeBuyerEmail(input.userEmail)
  let name = input.userName ?? null
  let fromCheckout = false

  if (input.stripeSessionId) {
    const checkout = await prisma.checkoutSessionData.findUnique({
      where: { stripeSessionId: input.stripeSessionId },
      select: { guestEmail: true, guestName: true, ticketMetadata: true },
    })
    const checkoutEmail = normalizeBuyerEmail(checkout?.guestEmail)
    if (checkoutEmail) {
      const metadata = checkout?.ticketMetadata as
        | Array<{ eventId?: string }>
        | null
      const metadataEventId = metadata?.find((item) => item.eventId)?.eventId
      if (!metadataEventId || metadataEventId === event.id) {
        email = checkoutEmail
        name = checkout?.guestName || name
        fromCheckout = true
      }
    }
  }

  if (!email) return null

  if (!fromCheckout) {
    const payment = await prisma.payment.findFirst({
      where: {
        eventId: event.id,
        refunded: false,
        OR: [
          { guestEmail: { equals: email, mode: 'insensitive' } },
          { user: { email: { equals: email, mode: 'insensitive' } } },
        ],
        type: { notIn: ['Membership', 'Shop', 'Refund'] },
      },
      select: { guestName: true },
    })
    if (!payment) return null
    name = name || payment.guestName
  }

  const referral = await getOrCreateTicketReferral({
    eventId: event.id,
    ownerEmail: email,
    ownerName: name,
    userId: input.userId,
  })

  return {
    code: referral.code,
    link: buildTicketReferralLink({
      eventKeyName: event.keyName,
      eventType: event.eventType,
      code: referral.code,
      locale: input.locale,
    }),
  }
}
