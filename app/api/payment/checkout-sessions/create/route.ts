import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFinalTicketPrice } from '@/lib/actions/price/getPrices'
import {
  buildAppliedDiscountsSingle,
  type TicketDiscountFields,
} from '@/lib/actions/payment/checkoutDiscountApplied'
import { normalizeReferralCode } from '@/lib/actions/referral/referralCode'
import {
  getActiveReferralDiscount,
  priceWithReferralDiscount,
} from '@/lib/actions/referral/referralOffer'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin') || 'http://localhost:3000'
    const {
      stripePriceId,
      stripeProductId,
      eventKeyName,
      userId,
      eventId,
      type,
      numberSession,
      email,
      seatNumber,
      eventTicketId,
      // Guest information (for payments without login)
      guestName,
      guestPhone,
      otherGuestsInfo, // Array of other guests' information
      // Event form responses
      formResponses,
      pricingIsSubscribed,
      pricingHasStudentDiscount,
      referralCode,
    } = await req.json()

    const normalizedReferralCode = normalizeReferralCode(referralCode)

    let priceIdToUse = stripePriceId
    const useStudentPricing =
      Boolean(pricingHasStudentDiscount) && type !== 'Membership'
    const pricingSubscribed = Boolean(pricingIsSubscribed)

    let dbTicketForDiscounts: TicketDiscountFields | null = null

    if (useStudentPricing) {
      if (!eventTicketId || !stripeProductId) {
        return NextResponse.json(
          { message: 'Missing ticket/product for student pricing checkout' },
          { status: 400 }
        )
      }

      const dbTicket = await prisma.eventTicket.findUnique({
        where: { id: eventTicketId },
        select: {
          id: true,
          price: true,
          discountMemberPercent: true,
          payTotalNumber: true,
          capacityPerTicket: true,
        },
      })

      if (!dbTicket) {
        return NextResponse.json(
          { message: 'Event ticket not found for student pricing checkout' },
          { status: 404 }
        )
      }

      dbTicketForDiscounts = dbTicket

      let refPrice: Stripe.Price
      try {
        refPrice = await stripe.prices.retrieve(stripePriceId)
      } catch {
        return NextResponse.json(
          { message: 'Failed to validate Stripe price for checkout' },
          { status: 400 }
        )
      }

      const unitDollars = getFinalTicketPrice(dbTicket, {
        isSubscribed: pricingSubscribed,
        hasActiveStudentDiscount: true,
        quantity: 1,
      })
      const unitCents = Math.round(unitDollars * 100)
      if (!Number.isFinite(unitCents) || unitCents < 1) {
        return NextResponse.json(
          { message: 'Invalid ticket unit price for student checkout' },
          { status: 400 }
        )
      }

      try {
        const created = await stripe.prices.create({
          unit_amount: unitCents,
          currency: refPrice.currency,
          product: stripeProductId,
          metadata: {
            pricingStudentAdjusted: 'true',
            ticketId: eventTicketId,
            referenceStripePriceId: stripePriceId,
          },
        })
        priceIdToUse = created.id
      } catch (error) {
        console.error('Failed to create Stripe price for student checkout:', error)
        return NextResponse.json(
          { message: 'Failed to create Stripe price for student checkout' },
          { status: 500 }
        )
      }
    } else if (
      pricingSubscribed &&
      eventTicketId &&
      type !== 'Membership'
    ) {
      dbTicketForDiscounts = await prisma.eventTicket.findUnique({
        where: { id: eventTicketId },
        select: {
          id: true,
          discountMemberPercent: true,
          price: true,
          capacityPerTicket: true,
          payTotalNumber: true,
        },
      })
    }

    const discountApplied = buildAppliedDiscountsSingle({
      dbTicket: dbTicketForDiscounts,
      pricingSubscribed,
      useStudentPricing,
      type,
    })

    const referralDiscount =
      type === 'Membership' || !eventId
        ? null
        : await getActiveReferralDiscount({
            eventId,
            code: normalizedReferralCode,
            buyerEmail: email,
          })
    if (referralDiscount) {
      priceIdToUse = await priceWithReferralDiscount(
        stripe,
        priceIdToUse,
        referralDiscount.percent,
        new Map()
      )
      discountApplied.push({
        kind: 'referral',
        code: referralDiscount.code,
        percentOff: referralDiscount.percent,
      })
    }

    // Create single line item for one ticket
    const lineItems = [
      {
        price: priceIdToUse,
        quantity: 1,
      },
    ]

    // Store checkout data in database if we have guest info or form responses
    // This is needed because Stripe metadata has a 500-character limit per value
    let checkoutDataId: string | undefined = undefined
    if (
      guestName ||
      guestPhone ||
      (Array.isArray(otherGuestsInfo) && otherGuestsInfo.length > 0) ||
      formResponses ||
      discountApplied.length > 0 ||
      normalizedReferralCode
    ) {
      const checkoutData = await prisma.checkoutSessionData.create({
        data: {
          guestName: guestName || null,
          guestEmail: email || null,
          guestPhone: guestPhone || null,
          otherGuestsInfo:
            Array.isArray(otherGuestsInfo) && otherGuestsInfo.length > 0
              ? otherGuestsInfo
              : undefined,
          seatNumbers: seatNumber ? [seatNumber] : undefined,
          ticketMetadata: [{
            ticketId: eventTicketId,
            seatNumbers: seatNumber ? [seatNumber] : [],
            quantity: 1,
            type: type,
          }],
          formResponses: formResponses || undefined,
          discountApplied: discountApplied.length > 0 ? discountApplied : undefined,
          referralCode: normalizedReferralCode || undefined,
          status: 'PENDING',
        },
      })
      checkoutDataId = checkoutData.id
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: type === 'Membership' ? 'subscription' : 'payment',
      customer_email: email,
      success_url:
        type === 'Membership'
          ? `${origin}/registration/membership/payment/success`
          : type === 'Concert'
            ? `${origin}/events/concert/${eventKeyName}/payment/success?session_id={CHECKOUT_SESSION_ID}`
            : `${origin}/events/class/${eventKeyName}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        type === 'Membership'
          ? `${origin}/registration/membership`
          : `${origin}/events/class/${eventKeyName}`,
      allow_promotion_codes: false,
      metadata: {
        userId: userId || '',
        eventId: eventId,
        stripePriceId: priceIdToUse,
        stripeProductId: stripeProductId,
        eventTicketId: eventTicketId || '',
        type: type,
        pricingIsSubscribed: pricingSubscribed ? 'true' : 'false',
        pricingHasStudentDiscount: useStudentPricing ? 'true' : 'false',
        ...(seatNumber && { seatNumber: seatNumber }),
        // If we stored data in CheckoutSessionData, use that
        // Otherwise, fallback to inline metadata (backward compatibility)
        ...(checkoutDataId ? { checkoutDataId } : {
          ...(guestName && { guestName: guestName }),
          ...(email && { guestEmail: email }),
          ...(guestPhone && { guestPhone: guestPhone }),
        }),
        description:
          type === 'Membership'
            ? 'Monthly Membership'
            : type === 'Concert'
              ? `Concert Registration for ${eventKeyName}`
              : type === 'Class'
                ? `Class Registration for ${eventKeyName} with (${numberSession} sessions)`
                : `Ticket Registration for ${eventKeyName} with (${numberSession} sessions)`,
      },
    })

    return NextResponse.json({ id: session.id })
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ message: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { message: 'Stripe session creation failed' },
      { status: 500 }
    )
  }
}
