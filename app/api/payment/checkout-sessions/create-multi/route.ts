import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { verifyEventDiscountCode } from '@/lib/actions/event/verifyEventDiscountCode'
import { getEventDiscountsAndTickets } from '@/lib/actions/event/getEventDiscountsAndTickets'
import { prisma } from '@/lib/db'
import { CheckoutItems } from '@/lib/types/payment'
import { getFinalTicketPrice } from '@/lib/actions/price/getPrices'
import { buildAppliedDiscountsMulti } from '@/lib/actions/payment/checkoutDiscountApplied'

// ##################### FLOW OF PRICES ######################
// Discount price creation (event_discount)
// │
// ├─ Gate: shouldApplyDiscount
// │   ├─ false → no discounted prices created (skip entire block)
// │   │         conditions: type === 'Membership' OR (effectivePercent ≤ 0 AND effectiveAmount ≤ 0)
// │   └─ true → continue
// │             (needs: type !== 'Membership' AND (effectivePercent > 0 OR effectiveAmount > 0))
// │
// ├─ Compute totalDiscountAmount (only when shouldApplyDiscount)
// │   ├─ If effectivePercent > 0
// │   │   └─ For each unit: round(unitPrice × (1 − effectivePercent/100)), sum → totalAfterPercentDiscounts
// │   ├─ Else totalAfterPercentDiscounts = totalAfterMembership
// │   ├─ totalAfterAllEventDiscounts = max(0, totalAfterPercentDiscounts − effectiveAmount)
// │   └─ totalDiscountAmount = round(totalAfterMembership − totalAfterAllEventDiscounts, 2)
// │
// ├─ Group checkout lines by resolved price id (key = resolveStripePriceId(item))
// │   │
// │   └─ resolveStripePriceId (base for “subscribed” / student)
// │       ├─ If NOT useStudentPricing (no student flag OR type === 'Membership')
// │       │   └─ use item.stripePriceId  ← member vs public is whatever the client sent on that id
// │       └─ If useStudentPricing
// │           └─ key = ticketId + ':' + (pricingIsSubscribed ? '1' : '0')
// │               ├─ if cache has student-adjusted id → use it (member tier baked in via getFinalTicketPrice)
// │               └─ else fallback → item.stripePriceId
// │
// └─ For each price group (priceId → list of {item, unitCount, unitPrice from Stripe retrieve})
//     │
//     ├─ If NOT shouldApplyDiscount OR totalDiscountAmount === 0
//     │   └─ skip this group (no create)
//     │
//     ├─ Else compute proportional discount for group
//     │   ├─ groupTotal = Σ(unitPrice × unitCount)
//     │   ├─ groupDiscount = (groupTotal / totalAfterMembership) × totalDiscountAmount
//     │   ├─ groupFinalTotal = groupTotal − groupDiscount
//     │   ├─ totalUnits = Σ unitCount
//     │   └─ discountedAmountInCents = round((groupFinalTotal / totalUnits) × 100)
//     │
//     └─ If discountedPriceCache already has this priceId
//         └─ skip create (reuse)
//         Else
//             └─ stripe.prices.create
//                 ├─ unit_amount = discountedAmountInCents
//                 ├─ currency from original Stripe price
//                 ├─ product = firstItem.stripeProductId
//                 └─ metadata: originalPriceId, discountType event_discount, effective %/$ strings, optional code fields
//                 ├─ on success → cache price id under original resolved priceId
//                 └─ on failure → log only (no throw)
// #######################################################################

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

// Shape of discounts stored in event.eventDiscounts JSON field
interface EventDiscountJson {
  id?: string
  type?: string
  discountAmount?: number
  discountUnit?: 'percentage' | 'amount'
  minQuantity?: number | null
  minTotal?: number | null
  code?: string | null
  cannotBeStacked?: boolean | null
}


export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin') || 'http://localhost:3000'
    const {
      eventKeyName,
      userId,
      eventId,
      type,
      mainEmail,
      checkoutItems,
      discountCode, // Only the code - will be re-verified server-side
      // Guest information (for payments without login)
      guestName,
      guestPhone,
      otherGuestsInfo, // Array of other guests' information
      formResponses, // Event form responses
      pricingIsSubscribed,
      pricingHasStudentDiscount,
    }: {
      eventKeyName: string
      userId?: string
      eventId: string
      type: string
      mainEmail: string
      checkoutItems: CheckoutItems
      discountCode?: string
      guestName?: string
      guestPhone?: string
      otherGuestsInfo?: Array<{ name: string; email: string; phone: string }>
      formResponses?: any
      /** Matches client member pricing (additive with student in getFinalTicketPrice). */
      pricingIsSubscribed?: boolean
      pricingHasStudentDiscount?: boolean
    } = await req.json()

    if (!checkoutItems || !Array.isArray(checkoutItems) || checkoutItems.length === 0) {
      return NextResponse.json(
        { message: 'Invalid checkout items' },
        { status: 400 }
      )
    }

    // Create line items: one per seat, grouped by ticket type
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    const allSeatNumbers: string[] = []
    const ticketMetadata: Array<{ ticketId: string; seatNumbers: string[]; eventId: string }> = []

    // Count total items to determine if discount applies
    let totalItemCount = 0
    checkoutItems.forEach((item) => {
      // For non-seated tickets, seatNumbers is empty, so use quantity instead
      if (item.seatNumbers.length === 0 && (item as any).quantity) {
        totalItemCount += (item as any).quantity
      } else {
        totalItemCount += item.seatNumbers.length
      }
    })

    // Get event discounts from database (cached)
    const event = await getEventDiscountsAndTickets(eventId)

    if (!event) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 })
    }

    const ticketById = new Map(event.tickets.map((t) => [t.id, t]))

    // Per-order limits: aggregate units per ticket (same tier may not appear twice in normal UI,
    // but the API must enforce totals even if the client sends duplicate lines).
    const unitsPerTicket = new Map<string, number>()
    for (const item of checkoutItems) {
      if (!item.ticketId) {
        return NextResponse.json(
          { message: 'Missing ticket id' },
          { status: 400 }
        )
      }
      if (!item.eventId || item.eventId !== eventId) {
        return NextResponse.json(
          { message: 'Checkout item does not match this event' },
          { status: 400 }
        )
      }

      const ticketId = item.ticketId
      const dbTicket = ticketById.get(ticketId)
      if (!dbTicket) {
        return NextResponse.json(
          { message: 'Ticket does not belong to this event' },
          { status: 400 }
        )
      }

      let units: number
      if (item.seatNumbers.length > 0) {
        units = item.seatNumbers.length
      } else {
        const q = item.quantity
        if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) {
          return NextResponse.json(
            { message: 'Valid quantity is required for non-seated tickets' },
            { status: 400 }
          )
        }
        units = q
      }

      unitsPerTicket.set(ticketId, (unitsPerTicket.get(ticketId) ?? 0) + units)
    }

    for (const [ticketId, totalUnits] of unitsPerTicket) {
      const dbTicket = ticketById.get(ticketId)!
      if (dbTicket.limit != null && totalUnits > dbTicket.limit) {
        return NextResponse.json(
          {
            message: `Maximum ${dbTicket.limit} ticket(s) per order for this ticket type`,
          },
          { status: 400 }
        )
      }
    }

    const useStudentPricing =
      Boolean(pricingHasStudentDiscount) && type !== 'Membership'
    const pricingSubscribed = Boolean(pricingIsSubscribed)

    const studentAdjustedStripePriceIdCache = new Map<string, string>()
    const stripePriceCache = new Map<string, Stripe.Price>()

    if (useStudentPricing) {
      const studentKeysSeen = new Set<string>()
      for (const item of checkoutItems) {
        const cacheKey = `${item.ticketId}:${pricingSubscribed ? '1' : '0'}`
        if (studentKeysSeen.has(cacheKey)) continue
        studentKeysSeen.add(cacheKey)

        const dbTicket = ticketById.get(item.ticketId)
        if (!dbTicket || !item.stripeProductId) {
          return NextResponse.json(
            {
              message: `Ticket ${item.ticketId} is missing Stripe product configuration`,
            },
            { status: 400 }
          )
        }

        let refPrice: Stripe.Price
        try {
          refPrice = await stripe.prices.retrieve(item.stripePriceId)
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
            product: item.stripeProductId,
            metadata: {
              pricingStudentAdjusted: 'true',
              ticketId: item.ticketId,
              referenceStripePriceId: item.stripePriceId,
            },
          })
          studentAdjustedStripePriceIdCache.set(cacheKey, created.id)
          stripePriceCache.set(created.id, created)
        } catch (error) {
          console.error('Failed to create Stripe price for student checkout:', error)
          return NextResponse.json(
            { message: 'Failed to create Stripe price for student checkout' },
            { status: 500 }
          )
        }
      }
    }

    const resolveStripePriceId = (item: (typeof checkoutItems)[number]) => {
      if (!useStudentPricing) return item.stripePriceId
      const key = `${item.ticketId}:${pricingSubscribed ? '1' : '0'}`
      return studentAdjustedStripePriceIdCache.get(key) ?? item.stripePriceId
    }

    // Calculate total from Stripe line prices (member tier via price id; student via DB-aligned prices)
    let totalAfterMembership = 0

    for (const item of checkoutItems) {
      const priceId = resolveStripePriceId(item)
      if (!stripePriceCache.has(priceId)) {
        try {
          const stripePrice = await stripe.prices.retrieve(priceId)
          stripePriceCache.set(priceId, stripePrice)
        } catch (error) {
          console.error('Failed to retrieve Stripe price:', error)
          continue
        }
      }

      const stripePrice = stripePriceCache.get(priceId)!
      const unitAmount = stripePrice.unit_amount || 0
      const priceInDollars = unitAmount / 100 // Convert cents to dollars

      if (item.seatNumbers.length > 0) {
        // Seated tickets: price per seat
        totalAfterMembership += priceInDollars * item.seatNumbers.length
      } else if ((item as any).quantity) {
        // Non-seated tickets: price * quantity
        // Note: Stripe prices already account for capacityPerTicket and payTotalNumber
        totalAfterMembership += priceInDollars * (item as any).quantity
      }
    }

    // Normalize discounts JSON into a typed array
    const discountList: EventDiscountJson[] = event.eventDiscounts && Array.isArray(event.eventDiscounts)
      ? (event.eventDiscounts as EventDiscountJson[])
      : []

    // Re-verify discount code server-side to prevent tampering
    let verifiedCodeDiscount: { code: string; discountAmount: number; discountUnit: 'percentage' | 'amount'; cannotBeStacked: boolean } | null = null
    if (discountCode && typeof discountCode === 'string' && discountCode.trim()) {
      try {
        const verificationResult = await verifyEventDiscountCode({
          eventId,
          code: discountCode.trim(),
        })
        if (verificationResult.valid) {
          verifiedCodeDiscount = {
            code: verificationResult.code!,
            discountAmount: verificationResult.discountAmount!,
            discountUnit: verificationResult.discountUnit!,
            cannotBeStacked: verificationResult.cannotBeStacked,
          }
        } else if (verificationResult.reason === 'Code usage limit reached') {
          return NextResponse.json(
            { message: 'This discount code has reached its usage limit.' },
            { status: 400 }
          )
        }
        // If verification fails for any other reason, silently ignore (don't apply code discount)
      } catch (error) {
        console.error('Failed to verify discount code:', error)
        // Silently ignore verification errors
      }
    }

    // Calculate effective discount using the same logic as EventCartCheckout.tsx
    let effectivePercent = 0
    let effectiveAmount = 0
    let codeDiscountApplied = false

    if (discountList.length > 0 || verifiedCodeDiscount) {
      // First, for each non-code discount type, pick the single "best" qualifying discount
      // separately for percentage-based and amount-based discounts:
      // - Bulk Discount: highest minQuantity (stricter condition)
      // - Minimum Total Discount: highest minTotal
      let bestBulkPercent: EventDiscountJson | null = null
      let bestMinTotalPercent: EventDiscountJson | null = null
      let bestBulkAmount: EventDiscountJson | null = null
      let bestMinTotalAmount: EventDiscountJson | null = null

      discountList.forEach((discount) => {
        const value = discount.discountAmount ?? 0
        if (value <= 0) return

        const unit = discount.discountUnit ?? 'percentage'

        if (discount.type === 'Bulk Discount') {
          const minQty = discount.minQuantity ?? 0
          const qualifies = totalItemCount >= minQty
          if (!qualifies) return

          if (unit === 'amount') {
            if (!bestBulkAmount || (bestBulkAmount.minQuantity ?? 0) < minQty) {
              bestBulkAmount = discount
            }
          } else {
            if (!bestBulkPercent || (bestBulkPercent.minQuantity ?? 0) < minQty) {
              bestBulkPercent = discount
            }
          }
        } else if (discount.type === 'Minimum Total Discount') {
          const minTotal = discount.minTotal ?? 0
          const qualifies = totalAfterMembership >= minTotal
          if (!qualifies) return

          if (unit === 'amount') {
            if (!bestMinTotalAmount || (bestMinTotalAmount.minTotal ?? 0) < minTotal) {
              bestMinTotalAmount = discount
            }
          } else {
            if (!bestMinTotalPercent || (bestMinTotalPercent.minTotal ?? 0) < minTotal) {
              bestMinTotalPercent = discount
            }
          }
        }
      })

      // If both percentage and amount discounts exist for the same type,
      // only keep the one with the highest requirement (minQuantity for Bulk, minTotal for Minimum Total)
      if (bestBulkPercent && bestBulkAmount) {
        const bulkPercent = bestBulkPercent as EventDiscountJson
        const bulkAmount = bestBulkAmount as EventDiscountJson
        const percentMinQty = bulkPercent.minQuantity ?? 0
        const amountMinQty = bulkAmount.minQuantity ?? 0
        if (amountMinQty > percentMinQty) {
          bestBulkPercent = null
        } else if (percentMinQty > amountMinQty) {
          bestBulkAmount = null
        } else {
          // If equal, prefer percentage (arbitrary choice)
          bestBulkAmount = null
        }
      }

      if (bestMinTotalPercent && bestMinTotalAmount) {
        const minTotalPercent = bestMinTotalPercent as EventDiscountJson
        const minTotalAmount = bestMinTotalAmount as EventDiscountJson
        const percentMinTotal = minTotalPercent.minTotal ?? 0
        const amountMinTotal = minTotalAmount.minTotal ?? 0
        if (amountMinTotal > percentMinTotal) {
          bestMinTotalPercent = null
        } else if (percentMinTotal > amountMinTotal) {
          bestMinTotalAmount = null
        } else {
          // If equal, prefer percentage (arbitrary choice)
          bestMinTotalAmount = null
        }
      }

      // --- Percentage-based discounts ---
      const percentDiscounts: EventDiscountJson[] = []
      if (bestBulkPercent) percentDiscounts.push(bestBulkPercent)
      if (bestMinTotalPercent) percentDiscounts.push(bestMinTotalPercent)

      // Approximate total discount value from non-code percentage discounts
      let approxNonCodePercentDiscount = 0
      let percentNonStackableChosen = false

      if (percentDiscounts.length > 0) {
        // Compute total stackable percentage and best non-stackable percentage
        let stackablePercent = 0
        let bestNonStackablePercent = 0

        percentDiscounts.forEach((discount) => {
          const pct = discount.discountAmount ?? 0
          if (pct <= 0) return

          const isNonStackable = !!discount.cannotBeStacked

          if (isNonStackable) {
            bestNonStackablePercent = Math.max(bestNonStackablePercent, pct)
          } else {
            stackablePercent += pct
          }
        })

        // Decide event percentage from non-code discounts
        const nonCodePercent =
          stackablePercent > 0 && bestNonStackablePercent > 0
            ? Math.max(stackablePercent, bestNonStackablePercent)
            : stackablePercent > 0
              ? stackablePercent
              : bestNonStackablePercent
        effectivePercent = nonCodePercent
        approxNonCodePercentDiscount = totalAfterMembership * (effectivePercent / 100)

        percentNonStackableChosen =
          bestNonStackablePercent > 0 &&
          (stackablePercent === 0 || bestNonStackablePercent >= stackablePercent)
      }

      // --- Amount-based discounts (absolute values) ---
      const amountDiscounts: EventDiscountJson[] = []
      if (bestBulkAmount) amountDiscounts.push(bestBulkAmount)
      if (bestMinTotalAmount) amountDiscounts.push(bestMinTotalAmount)

      let stackableAmount = 0
      let bestNonStackableAmount = 0
      let amountNonStackableChosen = false

      if (amountDiscounts.length > 0) {
        amountDiscounts.forEach((discount) => {
          const amount = discount.discountAmount ?? 0
          if (amount <= 0) return

          const isNonStackable = !!discount.cannotBeStacked

          if (isNonStackable) {
            bestNonStackableAmount = Math.max(bestNonStackableAmount, amount)
          } else {
            stackableAmount += amount
          }
        })

        // Decide event amount from non-code discounts
        const nonCodeAmount =
          stackableAmount > 0 && bestNonStackableAmount > 0
            ? Math.max(stackableAmount, bestNonStackableAmount)
            : stackableAmount > 0
              ? stackableAmount
              : bestNonStackableAmount

        effectiveAmount = nonCodeAmount

        if (bestNonStackableAmount > 0 && effectiveAmount === bestNonStackableAmount) {
          amountNonStackableChosen = true
        }
      }

      // Decide between non-stackable amount and percentage discounts
      if (bestNonStackableAmount > 0) {
        const amountValue = bestNonStackableAmount
        const percentValue = approxNonCodePercentDiscount

        if (amountValue >= percentValue) {
          // Amount wins: drop non-code percentage discounts completely
          effectivePercent = 0
          effectiveAmount = amountValue
          percentNonStackableChosen = false
          amountNonStackableChosen = true
        } else {
          // Percentage wins: drop all amount discounts when the winning percentage is non-stackable
          if (percentNonStackableChosen) {
            effectiveAmount = 0
          } else {
            // If percentage is stackable, keep stackable amount discounts
            effectiveAmount = stackableAmount
          }
          amountNonStackableChosen = false
        }
      }

      // If a non-stackable percentage discount won and there were no non-stackable
      // amount discounts to compare, we should still compare against stackable amount discounts
      if (percentNonStackableChosen && bestNonStackableAmount === 0 && effectiveAmount > 0) {
        const percentValue = approxNonCodePercentDiscount
        const amountValue = effectiveAmount // This is stackableAmount at this point

        if (amountValue > percentValue) {
          // Stackable amount discounts are better: replace the non-stackable percentage
          effectivePercent = 0
          effectiveAmount = amountValue
          percentNonStackableChosen = false
        } else {
          // Non-stackable percentage is better: drop all amount discounts
          effectiveAmount = 0
          amountNonStackableChosen = false
        }
      }

      // Now incorporate the (possibly verified) Code Discount
      if (verifiedCodeDiscount && verifiedCodeDiscount.discountAmount > 0) {
        if (verifiedCodeDiscount.discountUnit === 'percentage') {
          const codePercent = verifiedCodeDiscount.discountAmount
          if (verifiedCodeDiscount.cannotBeStacked) {
            // Non-stackable: pick the better of code vs non-code percentage
            if (codePercent > effectivePercent) {
              effectivePercent = codePercent
              codeDiscountApplied = true
            }
          } else {
            // Stackable code discount: if there's a non-stackable bulk discount,
            // compare and replace if code discount is better. Otherwise, add on top.
            if (percentNonStackableChosen) {
              if (codePercent > effectivePercent) {
                // Code discount wins: replace the non-stackable bulk discount
                // and drop all amount discounts (stackable and non-stackable)
                effectivePercent = codePercent
                effectiveAmount = 0
                amountNonStackableChosen = false
                codeDiscountApplied = true
              }
            } else {
              // No non-stackable bulk discount: add stackable code discount on top
              effectivePercent += codePercent
              codeDiscountApplied = true
            }
          }
        } else {
          const codeAmount = verifiedCodeDiscount.discountAmount
          if (verifiedCodeDiscount.cannotBeStacked) {
            // Non-stackable amount code: compete with existing non-code discounts
            let nonCodeValue = 0
            if (percentNonStackableChosen && !amountNonStackableChosen) {
              nonCodeValue = approxNonCodePercentDiscount
            } else if (!percentNonStackableChosen && amountNonStackableChosen) {
              nonCodeValue = effectiveAmount
            } else {
              nonCodeValue = approxNonCodePercentDiscount + effectiveAmount
            }
            if (codeAmount >= nonCodeValue) {
              // Code amount wins: drop other event discounts
              effectivePercent = 0
              effectiveAmount = codeAmount
              codeDiscountApplied = true
            }
          } else {
            // Stackable amount code: if there's a non-stackable percentage discount,
            // compare and replace if code discount is better. Otherwise, add to existing amount discounts.
            if (percentNonStackableChosen) {
              const percentDiscountValue = approxNonCodePercentDiscount
              if (codeAmount >= percentDiscountValue) {
                // Code discount wins: replace the non-stackable percentage discount
                // and drop all amount discounts (stackable and non-stackable)
                effectivePercent = 0
                effectiveAmount = codeAmount
                amountNonStackableChosen = false
                codeDiscountApplied = true
              }
            } else {
              // No non-stackable percentage discount: add stackable amount code to existing amount discounts
              effectiveAmount += codeAmount
              codeDiscountApplied = true
            }
          }
        }
      }
    }

    // Apply discount at price level if effective discount > 0
    const shouldApplyDiscount = (effectivePercent > 0 || effectiveAmount > 0) && type !== 'Membership'

    // Cache for discounted prices to avoid creating duplicates
    const discountedPriceCache = new Map<string, string>()

    // Calculate total discount amount matching frontend logic:
    // Frontend applies percentage discount first, then subtracts amount discount
    // 1. Apply percentage: totalAfterPercent = totalAfterMembership * (1 - effectivePercent / 100)
    // 2. Apply amount: totalAfterAll = max(0, totalAfterPercent - effectiveAmount)
    // We need to match this by rounding per unit, then distributing across items
    let totalAfterPercentDiscounts = totalAfterMembership
    let totalDiscountAmount = 0

    if (shouldApplyDiscount) {
      // First apply percentage-based discounts (if any)
      if (effectivePercent > 0) {
        // Apply percentage discount per unit and round (matching frontend)
        let sumOfRoundedPrices = 0

        for (const item of checkoutItems) {
          const priceId = resolveStripePriceId(item)
          if (!stripePriceCache.has(priceId)) {
            try {
              const stripePrice = await stripe.prices.retrieve(priceId)
              stripePriceCache.set(priceId, stripePrice)
            } catch (error) {
              console.error('Failed to retrieve Stripe price:', error)
              continue
            }
          }

          const stripePrice = stripePriceCache.get(priceId)!
          const unitPrice = (stripePrice.unit_amount || 0) / 100

          const unitCount = item.seatNumbers.length > 0
            ? item.seatNumbers.length
            : ((item as any).quantity || 1)

          // Apply discount to each unit individually and round
          for (let i = 0; i < unitCount; i++) {
            const discountedPrice = unitPrice * (1 - effectivePercent / 100)
            const roundedPrice = Math.round(discountedPrice * 100) / 100
            sumOfRoundedPrices += roundedPrice
          }
        }

        totalAfterPercentDiscounts = sumOfRoundedPrices
      }

      // Then apply amount-based discounts on top of percentage discounts
      const totalAfterAllEventDiscounts = Math.max(0, totalAfterPercentDiscounts - effectiveAmount)

      totalDiscountAmount = totalAfterMembership - totalAfterAllEventDiscounts
      // Round to 2 decimal places (matching frontend)
      totalDiscountAmount = Math.round(totalDiscountAmount * 100) / 100
    }

    // Group items by price to calculate proportional discount distribution
    const priceGroups = new Map<string, Array<{ item: typeof checkoutItems[0]; unitCount: number; unitPrice: number }>>()

    for (const item of checkoutItems) {
      const key = resolveStripePriceId(item)
      if (!priceGroups.has(key)) {
        priceGroups.set(key, [])
      }

      // Get unit count and price
      const unitCount = item.seatNumbers.length > 0
        ? item.seatNumbers.length
        : ((item as any).quantity || 1)

      // Retrieve price to get unit amount
      if (!stripePriceCache.has(key)) {
        try {
          const stripePrice = await stripe.prices.retrieve(key)
          stripePriceCache.set(key, stripePrice)
        } catch (error) {
          console.error('Failed to retrieve Stripe price:', error)
          continue
        }
      }

      const stripePrice = stripePriceCache.get(key)!
      const unitPrice = (stripePrice.unit_amount || 0) / 100

      priceGroups.get(key)!.push({ item, unitCount, unitPrice })
    }

    // Calculate discounted prices for each price group
    for (const [priceId, group] of priceGroups.entries()) {
      if (!shouldApplyDiscount || totalDiscountAmount === 0) {
        continue
      }

      // Calculate total for this price group
      const groupTotal = group.reduce((sum, g) => sum + (g.unitPrice * g.unitCount), 0)

      // Calculate discount for this group proportionally based on final discount amount
      const groupDiscount = (groupTotal / totalAfterMembership) * totalDiscountAmount
      const groupFinalTotal = groupTotal - groupDiscount

      // Calculate discounted price per unit
      const totalUnits = group.reduce((sum, g) => sum + g.unitCount, 0)
      const discountedPricePerUnit = groupFinalTotal / totalUnits

      // Round to cents (Stripe requires integer cents)
      const discountedAmountInCents = Math.round(discountedPricePerUnit * 100)

      // Get first item's details for creating the price
      const firstItem = group[0].item
      if (!discountedPriceCache.has(priceId)) {
        try {
          const originalPrice = stripePriceCache.get(priceId)!

          const discountedPrice = await stripe.prices.create({
            unit_amount: discountedAmountInCents,
            currency: originalPrice.currency,
            product: firstItem.stripeProductId,
            metadata: {
              originalPriceId: priceId,
              discountType: 'event_discount',
              discountPercent: effectivePercent.toString(),
              discountAmount: effectiveAmount.toString(),
              ...(verifiedCodeDiscount && {
                codeDiscount: verifiedCodeDiscount.code,
                codeDiscountAmount: verifiedCodeDiscount.discountAmount.toString(),
                codeDiscountUnit: verifiedCodeDiscount.discountUnit,
              }),
            },
          })

          discountedPriceCache.set(priceId, discountedPrice.id)
        } catch (error) {
          console.error('Failed to create discounted price:', error)
        }
      }
    }

    for (const item of checkoutItems) {
      const resolvedPriceId = resolveStripePriceId(item)
      let priceIdToUse = resolvedPriceId

      // If discount applies, use the discounted price
      if (shouldApplyDiscount && discountedPriceCache.has(resolvedPriceId)) {
        priceIdToUse = discountedPriceCache.get(resolvedPriceId)!
      }

      // Create line items: one per seat for seated tickets, or use quantity for non-seated tickets
      if (item.seatNumbers.length > 0) {
        // Seated tickets: create one line item per seat
        item.seatNumbers.forEach((seatNumber: string) => {
          lineItems.push({
            price: priceIdToUse,
            quantity: 1,
            ...(type === 'Membership'
              ? {}
              : {
                adjustable_quantity: {
                  enabled: false,
                },
              }),
          })
          allSeatNumbers.push(seatNumber)
        })
      } else if (item.quantity && item.quantity > 0) {
        // Non-seated tickets: create line items based on quantity
        const quantity = item.quantity
        for (let i = 0; i < quantity; i++) {
          lineItems.push({
            price: priceIdToUse,
            quantity: 1,
            ...(type === 'Membership'
              ? {}
              : {
                adjustable_quantity: {
                  enabled: false,
                },
              }),
          })
        }
      }

      ticketMetadata.push({
        ticketId: item.ticketId,
        seatNumbers: item.seatNumbers, // Empty array for non-seated tickets
        ...(item.seatNumbers.length === 0 && item.quantity && {
          quantity: item.quantity, // Include quantity for non-seated tickets
        }),
        eventId: item.eventId,
      })
    }

    const discountApplied = buildAppliedDiscountsMulti({
      checkoutItems,
      ticketById,
      pricingSubscribed: pricingSubscribed,
      useStudentPricing,
      type,
      shouldApplyDiscount,
      effectivePercent,
      effectiveAmount,
      totalDiscountAmount,
      totalAfterMembership,
      verifiedCodeDiscount,
      codeDiscountApplied,
    })

    // Save all checkout data to CheckoutSessionData before creating Stripe session
    const checkoutSessionData = await prisma.checkoutSessionData.create({
      data: {
        // Representative guest (main contact)
        guestName: guestName || undefined,
        guestEmail: mainEmail || undefined,
        guestPhone: guestPhone || undefined,
        // Seat and ticket data
        seatNumbers: allSeatNumbers.length > 0 ? allSeatNumbers : undefined,
        ticketMetadata: ticketMetadata,
        otherGuestsInfo: otherGuestsInfo && Array.isArray(otherGuestsInfo) && otherGuestsInfo.length > 0
          ? otherGuestsInfo
          : undefined,
        // Event form responses
        formResponses: formResponses || undefined,
        discountApplied: discountApplied.length > 0 ? discountApplied : undefined,
      },
    })

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: type === 'Membership' ? 'subscription' : 'payment',
      customer_email: mainEmail,
      success_url:
        type === 'Membership'
          ? `${origin}/registration/membership/payment/success`
          : type === 'Concert'
            ? `${origin}/events/concert/${eventKeyName}/payment/success`
            : `${origin}/events/class/${eventKeyName}/payment/success`,
      cancel_url:
        type === 'Membership'
          ? `${origin}/registration/membership`
          : `${origin}/events/class/${eventKeyName}`,
      allow_promotion_codes: false,
      metadata: {
        userId: userId || '',
        eventId: eventId,
        type: type,
        checkoutDataId: checkoutSessionData.id, // Store reference ID - all data is in CheckoutSessionData
        pricingIsSubscribed: pricingIsSubscribed ? 'true' : 'false',
        pricingHasStudentDiscount: pricingHasStudentDiscount ? 'true' : 'false',
        description:
          type === 'Membership'
            ? 'Monthly Membership'
            : type === 'Concert'
              ? allSeatNumbers.length > 1
                ? `Concert Registration for ${eventKeyName} - ${allSeatNumbers.length} seats`
                : `Concert Registration for ${eventKeyName}`
              : type === 'Class'
                ? `Class Registration for ${eventKeyName}`
                : `Ticket Registration for ${eventKeyName}`,
      },
    })

    // Update CheckoutSessionData with stripeSessionId for easier lookup
    await prisma.checkoutSessionData.update({
      where: { id: checkoutSessionData.id },
      data: { stripeSessionId: session.id },
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

