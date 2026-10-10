// Framework and third-party libraries
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { revalidateTag } from 'next/cache'
import { PaymentType } from '@prisma/client'
import type { IssuedTicket } from '@prisma/client'

// Database
import { prisma } from '@/lib/db'

// Server actions and utilities
import { sendPaymentConfirmationEmail } from '@/lib/actions/email/sendPaymentConfirmationEmail'
import { sendSubscriptionConfirmationEmail } from '@/lib/actions/email/sendSubscriptionConfirmationEmail'
import { sendShopOrderConfirmationEmail, ShopOrderItem } from '@/lib/actions/email/sendShopOrderConfirmationEmail'
import { getFinalTicketPrice } from '@/lib/actions/price/getPrices'
import { buildPostPaymentFormLink } from '@/lib/utils/buildPostPaymentFormLink'
import { issueTicketsForPayment } from '@/lib/actions/ticket/issueTickets'
import { buildTicketQrAttachments } from '@/lib/actions/ticket/generateTicketQr'
import { splitQrAttachments } from '@/lib/actions/ticket/splitQrAttachments'

// Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
})

/**
 * Send one confirmation email, retrying transient provider failures.
 * Throws the last error once all attempts are used.
 */
async function sendEmailWithRetry<T>(
  send: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await send()
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
      }
    }
  }
  throw lastError
}

/**
 * Read the request stream without parsing it.
 *
 * Stripe signature verification must receive the exact raw request bytes.
 */
async function getRawBody(
  readable: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const reader = readable.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }

  return Buffer.concat(chunks)
}

/**
 * Load the billing period and price associated with a subscription.
 * Returns null when Stripe cannot provide the subscription.
 */
async function getSubscriptionDetails(subscriptionId: string) {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const { current_period_start, current_period_end } =
      subscription.items.data[0]

    const { id } = subscription.items.data[0].price

    return { current_period_start, current_period_end, stripePriceId: id }
  } catch (error) {
    console.error('[SUBSCRIPTION_RETRIEVE_ERROR]', error)
    return null
  }
}

/**
 * Persist checkout metadata on a subscription so renewal invoice webhooks have
 * the user and purchase context required to update local records.
 */
async function updateSubscriptionMetadata(
  subscriptionId: string,
  metadata: Record<string, string>
) {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      metadata,
    })
    return subscription
  } catch (error) {
    console.error('[SUBSCRIPTION_METADATA_UPDATE_ERROR]', error)
    return null
  }
}

/**
 * Return the first line-item quantity for a completed checkout session.
 */
async function getCheckoutSessionQuantity(sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items'],
  })

  if (!session.line_items) return null

  return session.line_items.data.map((item) => item.quantity)[0] ?? null
}

/**
 * Resolve a stable payment identifier from a Stripe invoice.
 *
 * Stripe's Basil API can expose the payment intent through several invoice
 * shapes, so this helper checks the expanded payment data and legacy fields
 * before falling back to the invoice ID.
 */
async function getPaymentIntentFromInvoice(
  invoiceId: string
): Promise<string | null> {
  try {
    // With Basil API, expand payments (max 4 levels deep)
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['payments.data.payment'],
    })
    console.log('invoice gotten from getPaymentIntentFromInvoice', invoice)

    // Try to get payment_intent from expanded payments
    // @ts-ignore - payments exists on Invoice but structure may vary
    if (
      invoice.payments &&
      invoice.payments.data &&
      invoice.payments.data.length > 0
    ) {
      const payment = invoice.payments.data[0]
      console.log('payment from invoice.payments.data[0]', payment)

      // @ts-ignore - payment structure may vary
      if (payment.payment) {
        const paymentObj = payment.payment
        console.log('payment.payment object', paymentObj)

        // Check if payment_intent is a string ID or an expanded object
        // @ts-ignore
        if (paymentObj.payment_intent) {
          // @ts-ignore
          const paymentIntent = paymentObj.payment_intent
          if (typeof paymentIntent === 'string') {
            return paymentIntent
          } else if (
            paymentIntent &&
            typeof paymentIntent === 'object' &&
            'id' in paymentIntent
          ) {
            return paymentIntent.id as string
          }
        }

        // If payment_intent is not expanded, try to retrieve it
        // @ts-ignore - payment might have a payment_intent ID we can retrieve
        if (typeof paymentObj === 'string') {
          // If payment is just an ID, retrieve it
          try {
            const fullPayment = await stripe.paymentIntents.retrieve(paymentObj)
            return fullPayment.id
          } catch (e) {
            // Not a payment intent ID, continue
          }
        }
      }

      // Check if payment itself has payment_intent directly
      // @ts-ignore
      if (payment.payment_intent) {
        // @ts-ignore
        const paymentIntent = payment.payment_intent
        if (typeof paymentIntent === 'string') {
          return paymentIntent
        } else if (
          paymentIntent &&
          typeof paymentIntent === 'object' &&
          'id' in paymentIntent
        ) {
          return paymentIntent.id as string
        }
      }
    }

    // Fallback: check if payment_intent exists directly (for older API versions or non-subscription invoices)
    // @ts-ignore - payment_intent exists on Invoice but not in type definition
    if (invoice.payment_intent) {
      // @ts-ignore
      return invoice.payment_intent as string
    }

    // Alternative: Try to list invoice payments separately to get payment_intent
    try {
      // @ts-ignore - payments might have a list method or we can query separately
      const invoicePayments = await stripe.invoices.listUpcomingLines(invoiceId)
      // This might not work, but let's try listing payments for the invoice
    } catch (listError) {
      // Expected to fail, that's okay
    }

    // Try to get payment intent from invoice's payment collection
    // In Basil API, we might need to query invoice payments differently
    try {
      // Check if we can access payments through a different method
      // @ts-ignore
      if (invoice.payments && invoice.payments.data) {
        // @ts-ignore
        for (const paymentItem of invoice.payments.data) {
          console.log('Payment item from invoice:', paymentItem)
          // @ts-ignore - check various possible structures
          if (paymentItem.payment_intent) {
            // @ts-ignore
            const pi = paymentItem.payment_intent
            if (typeof pi === 'string') return pi
            if (pi && typeof pi === 'object' && 'id' in pi)
              return pi.id as string
          }
          // @ts-ignore
          if (paymentItem.id && typeof paymentItem.id === 'string') {
            // Try to retrieve this as a payment intent
            try {
              const pi = await stripe.paymentIntents.retrieve(paymentItem.id)
              return pi.id
            } catch (e) {
              // Not a payment intent, continue
            }
          }
        }
      }
    } catch (paymentError) {
      console.log('[PAYMENT_ITERATION_ERROR]', paymentError)
    }

    // Alternative: check for charge (used in some subscription scenarios)
    // @ts-ignore - charge exists on Invoice but not in type definition
    if (invoice.charge) {
      // @ts-ignore
      const chargeId = invoice.charge as string
      // Try to retrieve the charge to get payment_intent
      try {
        const charge = await stripe.charges.retrieve(chargeId)
        // @ts-ignore - payment_intent exists on Charge but not in type definition
        if (charge.payment_intent) {
          // @ts-ignore
          return charge.payment_intent as string
        }
        // If no payment_intent on charge, use charge ID as fallback
        return chargeId
      } catch (chargeError) {
        console.error('[GET_CHARGE_ERROR]', chargeError)
      }
    }

    // If we still can't find payment_intent, use invoice ID as fallback identifier
    // This can happen with subscription invoices in Basil API where payment_intent
    // is not directly accessible. The invoice ID is still a unique payment identifier.
    console.warn(
      `[PAYMENT_INTENT_NOT_FOUND] Using invoice ID as fallback: ${invoiceId}`
    )
    return invoiceId
  } catch (error) {
    console.error('[GET_PAYMENT_INTENT_FROM_INVOICE_ERROR]', error)
    return null
  }
}

/**
 * Resolve the payment identifier from a subscription's latest invoice.
 */
async function getPaymentIntentFromSubscription(
  subscriptionId: string
): Promise<string | null> {
  try {
    // Retrieve subscription with latest_invoice expanded (max 4 levels)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice'],
    })
    console.log(
      'subscription gotten from getPaymentIntentFromSubscription',
      subscription
    )

    // @ts-ignore - latest_invoice exists on Subscription
    if (subscription.latest_invoice) {
      const latestInvoice = subscription.latest_invoice

      // If latest_invoice is an object with an id, get payment intent from it
      if (
        typeof latestInvoice === 'object' &&
        latestInvoice !== null &&
        'id' in latestInvoice
      ) {
        const invoiceId =
          typeof latestInvoice.id === 'string' ? latestInvoice.id : null
        if (invoiceId) {
          return await getPaymentIntentFromInvoice(invoiceId)
        }
      } else if (typeof latestInvoice === 'string') {
        // If it's just an ID string, retrieve the invoice
        return await getPaymentIntentFromInvoice(latestInvoice)
      }
    }

    return null
  } catch (error) {
    console.error('[GET_PAYMENT_INTENT_FROM_SUBSCRIPTION_ERROR]', error)
    return null
  }
}

/**
 * Receive Stripe webhook events and persist successful purchases.
 *
 * Processing order:
 * 1. Verify the Stripe signature against the raw request body.
 * 2. Normalize supported event types into common payment metadata.
 * 3. Create shop, event-ticket, or membership payment records.
 * 4. Issue event admission QR tickets and send confirmation emails.
 * 5. Finalize checkout state and membership details.
 *
 * Non-critical email and QR generation failures are logged without rejecting
 * an otherwise valid payment webhook.
 */
export async function POST(req: NextRequest) {
  // Verify webhook authenticity before reading or processing event data.
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let bodyBuffer: Buffer
  try {
    bodyBuffer = await getRawBody(req.body as ReadableStream<Uint8Array>)
  } catch (error: unknown) {
    console.error('[RAW_BODY_ERROR]', error)
    const message =
      error instanceof Error ? error.message : 'Failed to read raw body'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      bodyBuffer,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error: unknown) {
    console.error('[STRIPE_SIGNATURE_ERROR]', error)
    const message =
      error instanceof Error
        ? error.message
        : 'Invalid Stripe webhook signature'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const successType: Stripe.Event['type'][] = [
    'checkout.session.completed',
    'payment_intent.succeeded',
    'invoice.paid',
  ]

  console.log('event webhook received', event)

  if (successType.includes(event.type)) {
    // Normalize supported event payloads into one payment representation.
    let paymentData:
      | Stripe.PaymentIntent
      | Stripe.Checkout.Session
      | Stripe.Invoice
    let chargedAmount: number = 0
    let subscriptionId: string | null = null
    let subscriptionEnd: number | null = null
    // let stripePriceId: string | null = null
    let metadata: Record<string, string> | null = null
    let quantity: number | null = null
    let paymentId: string | null = null

    if (event.type === 'payment_intent.succeeded') {
      paymentData = event.data.object as Stripe.PaymentIntent
      chargedAmount = paymentData.amount
      metadata = paymentData.metadata as Record<string, string>
      paymentId = paymentData.id
      quantity = 1
    } else if (event.type === 'invoice.paid') {
      // invoice.paid is triggered when a subscription is created or renewed
      // for this check, we only catch event when subscription is renewed, then it will have metadata.userId
      // otherwise, it will be handled in the checkout.session.completed event
      paymentData = event.data.object as Stripe.Invoice
      chargedAmount = paymentData.amount_paid

      // @ts-ignore - payment_intent exists on Invoice but not in type definition
      if (paymentData.payment_intent) {
        // @ts-ignore - payment_intent exists on Invoice but not in type definition
        paymentId = paymentData.payment_intent as string
      }

      // get metadata from the parent subscription
      metadata = paymentData.parent!.subscription_details!.metadata as Record<
        string,
        string
      >
      quantity = paymentData.lines.data.map((item) => item.quantity)[0] ?? 1

      // get subscription details
      if (paymentData.lines.data[0].subscription) {
        const subscriptionDetails = await getSubscriptionDetails(
          paymentData.lines.data[0].subscription as string
        )
        if (subscriptionDetails) {
          subscriptionEnd = subscriptionDetails.current_period_end
          // stripePriceId = subscriptionDetails.stripePriceId
        }
      }
    } else if (event.type === 'checkout.session.completed') {
      paymentData = event.data.object as Stripe.Checkout.Session
      chargedAmount = paymentData.amount_total ?? 0
      metadata = paymentData.metadata as Record<string, string>
      quantity = (await getCheckoutSessionQuantity(paymentData.id)) ?? 1

      // For subscription mode checkout sessions, payment_intent is null on the session
      // We need to get it from the invoice or subscription instead
      if (paymentData.payment_intent) {
        // Regular payment mode - payment_intent is directly on the session
        paymentId = paymentData.payment_intent as string
      } else if (paymentData.subscription) {
        // Subscription mode - try to get payment_intent from subscription's latest invoice
        subscriptionId = paymentData.subscription as string
        paymentId = await getPaymentIntentFromSubscription(subscriptionId)

        // If that didn't work, try the invoice from the checkout session
        if (!paymentId && paymentData.invoice) {
          paymentId = await getPaymentIntentFromInvoice(
            paymentData.invoice as string
          )
        }

        const subscriptionDetails = await getSubscriptionDetails(subscriptionId)
        if (subscriptionDetails) {
          subscriptionEnd = subscriptionDetails.current_period_end
          // stripePriceId = subscriptionDetails.stripePriceId
        }
      } else if (paymentData.invoice) {
        // Fallback: try invoice directly (shouldn't happen for subscriptions, but just in case)
        paymentId = await getPaymentIntentFromInvoice(
          paymentData.invoice as string
        )
      }
    } else {
      return NextResponse.json(
        { error: { message: 'Unsupported event type' } },
        { status: 400 }
      )
    }

    console.log('metadata', metadata)
    console.log('paymentData', paymentData)

    // Preserve the payment record even when Stripe does not expose an ID.
    // An empty value makes the missing identifier visible for later repair.
    if (!paymentId) {
      paymentId = ''
    }

    // Keep the Stripe customer email as a fallback for legacy checkout data.
    let customerEmail: string | null = null
    if (event.type === 'checkout.session.completed') {
      const session = paymentData as Stripe.Checkout.Session
      customerEmail = session.customer_email || null
    }
    
    // Fetch checkout session data from database if checkoutDataId exists
    let checkoutSessionData: {
      guestName: string | null
      guestEmail: string | null
      guestPhone: string | null
      seatNumbers: string[] | null
      ticketMetadata: Array<{
        ticketId: string
        seatNumbers: string[]
        quantity?: number
      }>
      shopItemMetadata: Array<{
        shopItemId: string
        quantity: number
      }> | null
      otherGuestsInfo: Array<{ name: string; email: string; phone: string }> | null
      formResponses: any | null
      discountApplied: any | null
    } | null = null

    if (metadata?.checkoutDataId) {
      try {
        const data = await prisma.checkoutSessionData.findUnique({
          where: { id: metadata.checkoutDataId },
          select: {
            guestName: true,
            guestEmail: true,
            guestPhone: true,
            seatNumbers: true,
            ticketMetadata: true,
            shopItemMetadata: true,
            otherGuestsInfo: true,
            formResponses: true,
            discountApplied: true,
          },
        })
        if (data) {
          checkoutSessionData = {
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            guestPhone: data.guestPhone,
            seatNumbers: data.seatNumbers as string[] | null,
            ticketMetadata: data.ticketMetadata as Array<{
              ticketId: string
              seatNumbers: string[]
              quantity?: number
            }>,
            shopItemMetadata: data.shopItemMetadata as Array<{
              shopItemId: string
              quantity: number
            }> | null,
            otherGuestsInfo: data.otherGuestsInfo as Array<{ name: string; email: string; phone: string }> | null,
            formResponses: data.formResponses,
            discountApplied: data.discountApplied,
          }
        }
      } catch (e) {
        console.error('Error fetching CheckoutSessionData:', e)
      }
    }

    // Handle guest information - use database data if available, otherwise fallback to metadata (backward compatibility)
    let guestName: string | null = null
    if (checkoutSessionData?.guestName) {
      // Use data from database (new method)
      guestName = checkoutSessionData.guestName
    } else if (metadata?.guestName && metadata.guestName.trim() !== '') {
      // Fallback to metadata (backward compatibility)
      guestName = metadata.guestName
    } else {
      console.error('[WEBHOOK_ERROR] guestName is required but not found in CheckoutSessionData or metadata. Using default: "Unknown User Name"')
      guestName = 'Unknown User Name'
    }

    let guestEmail: string = ''
    if (checkoutSessionData?.guestEmail) {
      // Use data from database (new method)
      guestEmail = checkoutSessionData.guestEmail
    } else {
      // Fallback to metadata or customerEmail from checkout session (backward compatibility)
      guestEmail = metadata?.guestEmail || customerEmail || ''
    }

    let guestPhone: string | null = null
    if (checkoutSessionData?.guestPhone) {
      // Use data from database (new method)
      guestPhone = checkoutSessionData.guestPhone
    } else if (metadata?.guestPhone && metadata.guestPhone.trim() !== '') {
      // Fallback to metadata (backward compatibility)
      guestPhone = metadata.guestPhone
    } else {
      console.error('[WEBHOOK_ERROR] guestPhone is required but not found in CheckoutSessionData or metadata. Using null.')
      guestPhone = null
    }

    // Parse otherGuestsInfo from database if available, otherwise from metadata (backward compatibility)
    let otherGuestsInfo: Array<{ name: string; email: string; phone: string }> | null = null
    if (checkoutSessionData?.otherGuestsInfo) {
      // Use data from database (new method)
      otherGuestsInfo = checkoutSessionData.otherGuestsInfo
    } else if (metadata?.otherGuestsInfo) {
      // Fallback to metadata parsing (backward compatibility)
      try {
        otherGuestsInfo = JSON.parse(metadata.otherGuestsInfo as string) as Array<{ name: string; email: string; phone: string }>
      } catch (e) {
        console.error('Error parsing otherGuestsInfo:', e)
        otherGuestsInfo = null
      }
    }

    // Create payment record in database
    try {
      const expiresAt =
        metadata.type === 'Membership' && subscriptionEnd
          ? new Date(subscriptionEnd * 1000)
          : null

      // Handle multi-ticket checkout with ticketMetadata
      const createdEventPaymentIds: string[] = []
      let ticketMetadata: Array<{
        ticketId: string
        seatNumbers: string[]
        quantity?: number // For non-seated tickets when seatNumbers is empty
      }> | null = null

      if (checkoutSessionData?.ticketMetadata) {
        // Use data from database (new method)
        ticketMetadata = checkoutSessionData.ticketMetadata
      } else if (metadata.ticketMetadata) {
        // Fallback to metadata parsing (backward compatibility)
        try {
          ticketMetadata = JSON.parse(
            metadata.ticketMetadata as string
          ) as Array<{
            ticketId: string
            seatNumbers: string[]
            quantity?: number
          }>
        } catch (e) {
          console.error('Error parsing ticketMetadata:', e)
        }
      }

      // Stripe redelivers events (timeouts, retries after a non-2xx response)
      // and can fire several success events for one payment. A payment that
      // already exists for this Stripe payment ID means this is a repeat, so we
      // must not create payments or QR tickets a second time.
      const existingPayments = paymentId
        ? await prisma.payment.findMany({
            where: { stripePaymentId: paymentId, type: { not: 'Refund' } },
            select: {
              id: true,
              type: true,
              eventId: true,
              _count: { select: { issuedTickets: true } },
            },
          })
        : []
      const existingEventPayments = existingPayments.filter(
        (p) => p.eventId && p.type !== 'Membership' && p.type !== 'Shop'
      )

      if (existingPayments.length > 0) {
        // Only reprocess when the earlier attempt left work unfinished:
        // event payments still missing their QR tickets, or a membership whose
        // user record may not have been updated yet.
        const needsRecovery =
          existingEventPayments.some((p) => p._count.issuedTickets === 0) ||
          existingPayments.some((p) => p.type === 'Membership')

        if (!needsRecovery) {
          console.log(
            '[WEBHOOK_DUPLICATE] Payment already processed, skipping',
            paymentId
          )
          return NextResponse.json(
            { received: true, duplicate: true },
            { status: 200 }
          )
        }

        console.warn(
          '[WEBHOOK_RECOVERY] Reprocessing incomplete payment',
          paymentId
        )
        // Reuse the payments from the earlier attempt; only the remaining
        // steps (QR tickets, emails, membership update) run below.
        createdEventPaymentIds.push(...existingEventPayments.map((p) => p.id))
      }

      ////// FOR SHOP CHECKOUT //////
      // Also check metadata.shopId as a fallback for sessions created before `type` was added to metadata
      else if (metadata.type === 'Shop' || (!metadata.type && metadata.shopId)) {
        metadata.type = 'Shop' // Ensure type is set for payment creation below
        const shopItemMetadata = checkoutSessionData?.shopItemMetadata

        if (shopItemMetadata && shopItemMetadata.length > 0) {
          // Fetch all shop items to get their prices
          const shopItemIds = shopItemMetadata.map((item) => item.shopItemId)
          const shopItems = await prisma.shopItem.findMany({
            where: { id: { in: shopItemIds } },
          })
          const shopItemMap = new Map(shopItems.map((item) => [item.id, item]))

          // Calculate total expected price for proportional pricePaid allocation
          let totalExpectedPrice = 0
          for (const itemInfo of shopItemMetadata) {
            const shopItem = shopItemMap.get(itemInfo.shopItemId)
            if (shopItem) {
              totalExpectedPrice += Number(shopItem.price) * itemInfo.quantity
            }
          }

          const actualTotal = chargedAmount / 100
          // priceRatio accounts for discrepancies between DB prices and what Stripe actually charged.
          // e.g. a promo code reduces the Stripe total but DB prices remain full price.
          // Multiplying each item's pricePaid by this ratio ensures all records sum to the exact charge.
          // (ratio = 1.0 when no discount was applied, so it is a no-op in the normal case)
          const priceRatio =
            totalExpectedPrice > 0 ? actualTotal / totalExpectedPrice : 1

          // Collect email order items while creating payment records
          const emailOrderItems: ShopOrderItem[] = []

          for (const itemInfo of shopItemMetadata) {
            const shopItem = shopItemMap.get(itemInfo.shopItemId)
            if (!shopItem) {
              console.warn(
                `[WEBHOOK_WARNING] ShopItem with id ${itemInfo.shopItemId} not found. Skipping payment creation.`
              )
              continue
            }

            const itemPricePaid =
              Number(shopItem.price) * itemInfo.quantity * priceRatio

            await prisma.payment.create({
              data: {
                userId:
                  metadata.userId && metadata.userId.trim() !== ''
                    ? metadata.userId
                    : null,
                shopId: metadata.shopId || null,
                shopItemId: itemInfo.shopItemId,
                stripePaymentId: paymentId,
                pricePaid: itemPricePaid,
                type: metadata.type as PaymentType,
                quantity: itemInfo.quantity,
                guestName: guestName,
                guestEmail: guestEmail,
                guestPhone: guestPhone,
                otherGuests: otherGuestsInfo || undefined,
                discountApplied: checkoutSessionData?.discountApplied || undefined,
              },
            })

            emailOrderItems.push({
              title: shopItem.title,
              quantity: itemInfo.quantity,
              unitPrice: Number(shopItem.price) * priceRatio,
              currency: shopItem.currency || 'CAD',
              imageUrl: shopItem.imageUrl,
            })
          }

          // Send shop order confirmation email
          if (guestEmail && emailOrderItems.length > 0) {
            try {
              const shopRecord = metadata.shopId
                ? await prisma.shop.findUnique({
                    where: { id: metadata.shopId },
                    select: { title: true, slug: true },
                  })
                : null

              await sendShopOrderConfirmationEmail({
                firstName: guestName?.split(' ')[0] || 'Valued Customer',
                to: guestEmail,
                totalPricePaid: chargedAmount / 100,
                currency: emailOrderItems[0]?.currency || 'CAD',
                shopName: shopRecord?.title || null,
                shopSlug: shopRecord?.slug || metadata.shopSlug || null,
                orderItems: emailOrderItems,
              })
            } catch (emailError) {
              console.error('[SHOP_ORDER_CONFIRMATION_EMAIL_ERROR]', emailError)
            }
          }
        } else {
          // Fallback: no per-item breakdown available, so create one consolidated record.
          // chargedAmount / 100 is already the exact amount Stripe charged — no ratio needed.
          await prisma.payment.create({
            data: {
              userId:
                metadata.userId && metadata.userId.trim() !== ''
                  ? metadata.userId
                  : null,
              shopId: metadata.shopId || null,
              stripePaymentId: paymentId,
              pricePaid: chargedAmount / 100,
              type: metadata.type as PaymentType,
              quantity: quantity || 1,
              guestName: guestName,
              guestEmail: guestEmail,
              guestPhone: guestPhone,
              otherGuests: otherGuestsInfo || undefined,
              discountApplied: checkoutSessionData?.discountApplied || undefined,
            },
          })

          // Send fallback shop order confirmation email (no item breakdown)
          if (guestEmail) {
            try {
              const shopRecord = metadata.shopId
                ? await prisma.shop.findUnique({
                    where: { id: metadata.shopId },
                    select: { title: true, slug: true },
                  })
                : null

              await sendShopOrderConfirmationEmail({
                firstName: guestName?.split(' ')[0] || 'Valued Customer',
                to: guestEmail,
                totalPricePaid: chargedAmount / 100,
                currency: 'CAD',
                shopName: shopRecord?.title || null,
                shopSlug: shopRecord?.slug || metadata.shopSlug || null,
                orderItems: [],
              })
            } catch (emailError) {
              console.error('[SHOP_ORDER_CONFIRMATION_EMAIL_ERROR]', emailError)
            }
          }
        }
      }

      ////// FOR MULTI-TICKET CHECKOUT //////
      else if (ticketMetadata && ticketMetadata.length > 0) {
        // Multi-ticket checkout: create payment record for each ticket type
        // Fetch all tickets to get their actual prices
        const ticketIds = ticketMetadata.map((t) => t.ticketId)
        const tickets = await prisma.eventTicket.findMany({
          where: { id: { in: ticketIds } },
        })

        // Create a map of ticketId to ticket for quick lookup
        const ticketMap = new Map(tickets.map((t) => [t.id, t]))

        const pricingIsSubscribed = metadata.pricingIsSubscribed === 'true'
        const pricingHasStudentDiscount =
          metadata.pricingHasStudentDiscount === 'true'

        // Calculate total expected price based on ticket prices
        let totalExpectedPrice = 0
        for (const ticketInfo of ticketMetadata) {
          const ticket = ticketMap.get(ticketInfo.ticketId)
          if (ticket) {
            // For non-seated tickets, use quantity; for seated tickets, use seatNumbers.length
            const count = ticketInfo.seatNumbers.length > 0 
              ? ticketInfo.seatNumbers.length 
              : (ticketInfo.quantity || 1)

            totalExpectedPrice += getFinalTicketPrice(ticket, {
              quantity: count,
              isSubscribed: pricingIsSubscribed,
              hasActiveStudentDiscount: pricingHasStudentDiscount,
            })
          }
        }

        // priceRatio accounts for discrepancies between DB prices and what Stripe actually charged.
        // e.g. a promo code reduces the Stripe total but DB prices remain full price.
        // Multiplying each item's pricePaid by this ratio ensures all records sum to the exact charge.
        // (ratio = 1.0 when no discount was applied, so it is a no-op in the normal case)
        const actualTotal = chargedAmount / 100
        const priceRatio =
          totalExpectedPrice > 0 ? actualTotal / totalExpectedPrice : 1

        for (const ticketInfo of ticketMetadata) {
          const ticket = ticketMap.get(ticketInfo.ticketId)
          if (!ticket) {
            console.warn(
              `[WEBHOOK_WARNING] EventTicket with id ${ticketInfo.ticketId} not found in ticketMap. Skipping payment creation.`
            )
            continue
          }

          // For non-seated tickets, use quantity; for seated tickets, use seatNumbers.length
          const seatCount = ticketInfo.seatNumbers.length > 0 
            ? ticketInfo.seatNumbers.length 
            : (ticketInfo.quantity || 1)

          // Calculate price for this ticket type, adjusted by ratio
          const ticketPricePaid =
            getFinalTicketPrice(ticket, {
              quantity: seatCount,
              isSubscribed: pricingIsSubscribed,
              hasActiveStudentDiscount: pricingHasStudentDiscount,
            }) * priceRatio

          const createdPayment = await prisma.payment.create({
            data: {
              userId: metadata.userId && metadata.userId.trim() !== '' ? metadata.userId : null,
              eventId: metadata.eventId,
              eventTicketId: ticketInfo.ticketId,
              stripePaymentId: paymentId,
              pricePaid: ticketPricePaid,
              type: metadata.type as PaymentType,
              expiresAt: expiresAt,
              quantity: seatCount,
              seatNumber: ticketInfo.seatNumbers.length > 0 
                ? ticketInfo.seatNumbers.join(', ') 
                : null, // null for non-seated tickets
              // Guest information
              guestName: guestName,
              guestEmail: guestEmail,
              guestPhone: guestPhone,
              otherGuests: otherGuestsInfo || undefined,
              // Event form responses
              formResponses: checkoutSessionData?.formResponses || undefined,
              discountApplied: checkoutSessionData?.discountApplied || undefined,
            },
          })
          createdEventPaymentIds.push(createdPayment.id)
        }
      } else {
        ////// FOR SINGLE TICKET CHECKOUT //////
        // Single ticket checkout (backward compatibility)
        // Validate eventTicketId exists if provided
        // For Membership payments, eventTicketId should always be null
        let validEventTicketId: string | null = null
        if (
          metadata.type !== 'Membership' &&
          metadata.eventTicketId &&
          metadata.eventTicketId.trim() !== ''
        ) {
          const ticketExists = await prisma.eventTicket.findUnique({
            where: { id: metadata.eventTicketId },
            select: { id: true },
          })
          if (ticketExists) {
            validEventTicketId = metadata.eventTicketId
          } else {
            console.warn(
              `[WEBHOOK_WARNING] EventTicket with id ${metadata.eventTicketId} not found. Creating payment without eventTicketId.`
            )
          }
        }

        // For Membership or empty/invalid eventTicketId, validEventTicketId remains null
        const createdPayment = await prisma.payment.create({
          data: {
            userId: metadata.userId && metadata.userId.trim() !== '' ? metadata.userId : null,
            eventId: metadata.eventId,
            eventTicketId: validEventTicketId, // Will be null for Membership or empty strings
            stripePaymentId: paymentId,
            pricePaid: chargedAmount / 100,
            type: metadata.type as PaymentType,
            expiresAt: expiresAt,
            quantity: quantity,
            seatNumber: metadata.seatNumber,
            // Guest information
            guestName: guestName,
            guestEmail: guestEmail,
            guestPhone: guestPhone,
            otherGuests: otherGuestsInfo || undefined,
            // Event form responses
            formResponses: checkoutSessionData?.formResponses || undefined,
            discountApplied: checkoutSessionData?.discountApplied || undefined,
          },
        })
        createdEventPaymentIds.push(createdPayment.id)
      }

      // Issue one scannable QR ticket per admission unit (skip membership / shop)
      let issuedTicketsForEmail: IssuedTicket[] = []
      if (
        metadata.type !== 'Membership' &&
        metadata.eventId &&
        createdEventPaymentIds.length > 0
      ) {
        try {
          const createdPayments = await prisma.payment.findMany({
            where: { id: { in: createdEventPaymentIds } },
            select: {
              id: true,
              eventId: true,
              eventTicketId: true,
              quantity: true,
              seatNumber: true,
            },
          })
          for (const payment of createdPayments) {
            if (!payment.eventId) continue
            const issued = await issueTicketsForPayment({
              paymentId: payment.id,
              eventId: payment.eventId,
              eventTicketId: payment.eventTicketId,
              quantity: payment.quantity,
              seatNumber: payment.seatNumber,
            })
            issuedTicketsForEmail.push(...issued)
          }
        } catch (issueError) {
          // Do not swallow: a paid customer without QR tickets must make the
          // webhook fail so Stripe retries. The retry reuses the saved payment
          // (see existingPayments above) and issues the missing tickets.
          console.error('[ISSUED_TICKET_CREATE_ERROR]', issueError)
          throw issueError
        }
      }

      // Send payment confirmation email
      // - For event tickets: detailed ticket email
      // - For memberships: generic membership confirmation email
      if (metadata.eventId || metadata.type === 'Membership') {
        try {
          // Fetch user data (used for both tickets and membership)
          // Always use guest info from metadata or checkout session
          const user: { name: string | null; email: string } | null = {
            name: guestName,
            email: guestEmail,
          }

          // Ticket-based email flow (non-membership with event)
          if (metadata.type !== 'Membership' && metadata.eventId) {
            // Handle multi-ticket checkout
            if (ticketMetadata && ticketMetadata.length > 0) {
              // For multi-ticket, send one email with all ticket types
              // Fetch all tickets
              const ticketIds = ticketMetadata.map((t) => t.ticketId)
              const tickets = await prisma.eventTicket.findMany({
                where: { id: { in: ticketIds } },
                include: {
                  event: {
                    select: {
                      title: true,
                      keyName: true,
                      eventType: true,
                      startDate: true,
                      endDate: true,
                      location: true,
                      days: true,
                      startTime: true,
                      endTime: true,
                      confirmationEmailSubject: true,
                      confirmationEmailBody: true,
                    },
                  },
                },
              })

              // Use the first ticket for event details (they're all from the same event)
              const firstTicket = tickets[0]
              if (user && user.email && firstTicket) {
                const pricePaid = chargedAmount / 100
                const firstName = user.name?.split(' ')[0] || 'Valued Customer'
                const allSeatNumbers = ticketMetadata
                  .flatMap((t) => t.seatNumbers)
                  .filter((s) => s.length > 0) // Filter out empty strings
                  .join(', ')
                
                // Calculate total quantity: sum of seatNumbers.length or quantity for non-seated tickets
                const totalQuantity = ticketMetadata.reduce((sum, t) => {
                  if (t.seatNumbers.length > 0) {
                    return sum + t.seatNumbers.length
                  } else {
                    return sum + (t.quantity || 1)
                  }
                }, 0)

                // Send email with combined information (purchaser + other guests, deduped)
                const paymentConfirmationPayload = {
                  ticketType: tickets.map((t) => t.type).join(', '), // Combined ticket types
                  pricePaid,
                  quantity: quantity || totalQuantity,
                  currency: firstTicket.currency || 'CAD',
                  ticketImageUrl: firstTicket.imageUrl,
                  perSessionPrice: Number(firstTicket.price) || 0,
                  payTotalNumber: firstTicket.payTotalNumber,
                  eventTitle: firstTicket.event.title,
                  seatNumber: allSeatNumbers || undefined, // undefined for non-seated tickets
                  eventStartDate: firstTicket.event.startDate,
                  eventEndDate: firstTicket.event.endDate,
                  eventLocation: firstTicket.event.location,
                  eventStartTime: firstTicket.event.startTime,
                  eventEndTime: firstTicket.event.endTime,
                  customSubject: firstTicket.event.confirmationEmailSubject,
                  customBody: firstTicket.event.confirmationEmailBody,
                  guestName: user.name || guestName || undefined,
                }
                const primaryEmail = user.email.trim()
                const payerUserId =
                  metadata.userId && metadata.userId.trim() !== ''
                    ? metadata.userId.trim()
                    : null
                const formAccessReference =
                  paymentId || createdEventPaymentIds[0] || null
                const eventFormExists = metadata.eventId
                  ? !!(await prisma.eventForm.findFirst({
                      where: { eventId: metadata.eventId },
                      select: { id: true },
                    }))
                  : false

                // Initialize with primary email
                const recipients: {
                  to: string
                  firstName: string
                  formLink?: string
                  /** Index of the QR ticket reserved for this guest (purchaser: none) */
                  ticketSlot?: number
                }[] = [
                  {
                    to: primaryEmail,
                    firstName,
                  },
                ]
                
                // Add other guests to recipients
                if (otherGuestsInfo?.length) {
                  for (const [guestIndex, g] of otherGuestsInfo.entries()) {
                    const email = g.email?.trim()
                    if (!email) continue
                    if (email.toLowerCase() === primaryEmail.toLowerCase()) continue
                    const formLink =
                      eventFormExists &&
                      firstTicket.event.keyName &&
                      (payerUserId || formAccessReference)
                        ? buildPostPaymentFormLink({
                            userId: payerUserId,
                            paymentReference: formAccessReference,
                            eventKeyName: firstTicket.event.keyName,
                            eventType: firstTicket.event.eventType,
                            guestEmail: email,
                          })
                        : undefined
                    recipients.push({
                      to: email,
                      firstName: g.name?.split(' ')[0] || 'Valued Customer',
                      formLink,
                      // Ticket 0 is the purchaser's; guest N gets ticket N
                      ticketSlot: guestIndex + 1,
                    })
                  }
                }
                const seenEmails = new Set<string>()
                const uniqueRecipients = recipients.filter((r) => {
                  const key = r.to.toLowerCase()
                  if (seenEmails.has(key)) return false
                  seenEmails.add(key)
                  return true
                })
                const qrAttachments =
                  issuedTicketsForEmail.length > 0
                    ? await buildTicketQrAttachments(
                        issuedTicketsForEmail,
                        tickets.map((t) => t.type).join(', ')
                      )
                    : []
                // Each guest gets only their own QR; the purchaser keeps their
                // own plus any ticket not claimed by an emailed guest.
                const guestRecipients = uniqueRecipients.filter(
                  (r) => r.ticketSlot !== undefined
                )
                const qrSplit = splitQrAttachments(
                  qrAttachments,
                  guestRecipients.map((r) => r.ticketSlot as number)
                )
                const qrByRecipient = new Map(
                  guestRecipients.map((r, i) => [r.to, qrSplit.guests[i]])
                )
                const sendResults = await Promise.allSettled(
                  uniqueRecipients.map((r) =>
                    sendEmailWithRetry(() =>
                      sendPaymentConfirmationEmail({
                        ...paymentConfirmationPayload,
                        firstName: r.firstName,
                        to: r.to,
                        formLink: r.formLink,
                        qrAttachments:
                          r.ticketSlot === undefined
                            ? qrSplit.purchaser
                            : (qrByRecipient.get(r.to) ?? []),
                      })
                    )
                  )
                )
                const failedSends = sendResults.filter(
                  (result) => result.status === 'rejected'
                )
                if (failedSends.length > 0) {
                  throw new Error(
                    `${failedSends.length} ticket confirmation email(s) failed after retries`
                  )
                }
              }
            }

            // update event seatingMap - handle both single and multiple seats
            // Get seat numbers from ticketMetadata if available, otherwise from checkoutSessionData or metadata
            const seatNumbersToUpdate: string[] = []
            if (ticketMetadata && ticketMetadata.length > 0) {
              // Use seat numbers from ticketMetadata (multi-ticket checkout)
              ticketMetadata.forEach((ticketInfo) => {
                seatNumbersToUpdate.push(...ticketInfo.seatNumbers)
              })
            } else if (checkoutSessionData?.seatNumbers && checkoutSessionData.seatNumbers.length > 0) {
              // Use seat numbers from database (new method)
              seatNumbersToUpdate.push(...checkoutSessionData.seatNumbers)
            } else if (metadata.seatNumbers) {
              // Multiple seats (backward compatibility)
              try {
                const parsed = JSON.parse(metadata.seatNumbers as string)
                if (Array.isArray(parsed)) {
                  seatNumbersToUpdate.push(...parsed)
                }
              } catch (e) {
                console.error('Error parsing seatNumbers:', e)
              }
            } else if (metadata.seatNumber) {
              // Single seat (backward compatibility)
              seatNumbersToUpdate.push(metadata.seatNumber as string)
            }

            if (seatNumbersToUpdate.length > 0) {
              const event = await prisma.event.findUnique({
                where: { id: metadata.eventId },
                select: {
                  seatingMap: true,
                },
              })

              if (!event) {
                console.error(
                  'Event not found, could not update seatingMap',
                  metadata.eventId
                )
                // Don't return error here - log and continue, as this shouldn't fail the webhook
              } else if (event.seatingMap) {
                try {
                  // Parse the seatingMap from JSON (if it's a string) or use directly (if already an object)
                  const seatingMap = (
                    typeof event.seatingMap === 'string'
                      ? JSON.parse(event.seatingMap)
                      : event.seatingMap
                  ) as Array<
                    Array<{
                      name?: string
                      status: number
                      ticketId?: string
                      ticketType?: string
                      price?: number
                      currency?: string
                    }>
                  >

                  // Find and update all seats with matching seatNumbers
                  const seatsFound: string[] = []
                  for (const seatNumberToUpdate of seatNumbersToUpdate) {
                    for (
                      let rowIndex = 0;
                      rowIndex < seatingMap.length;
                      rowIndex++
                    ) {
                      const row = seatingMap[rowIndex]
                      if (Array.isArray(row)) {
                        for (
                          let colIndex = 0;
                          colIndex < row.length;
                          colIndex++
                        ) {
                          const seat = row[colIndex]
                          if (seat && seat.name === seatNumberToUpdate) {
                            seat.status = 2 // OCCUPIED
                            seatsFound.push(seatNumberToUpdate)
                            break
                          }
                        }
                        if (seatsFound.includes(seatNumberToUpdate)) break
                      }
                    }
                  }
                  console.log('seats found and updated:', seatsFound)

                  // Update the seatingMap in the database if at least one seat was found
                  if (seatsFound.length > 0) {
                    console.log('updating seatingMap in database')
                    await prisma.event.update({
                      where: { id: metadata.eventId },
                      data: {
                        seatingMap: seatingMap,
                      },
                    })
                  }
                } catch (parseError) {
                  console.error(
                    'Error parsing or updating seatingMap:',
                    parseError
                  )
                  // Don't fail the webhook if seating map update fails
                }
              }
            }

            // Handle single ticket checkout email (if not already handled in multi-ticket section)
            if (
              !ticketMetadata &&
              metadata.eventTicketId &&
              metadata.type !== 'Membership'
            ) {
              // Single ticket checkout (backward compatibility)
              const ticket = await prisma.eventTicket.findUnique({
                where: { id: metadata.eventTicketId },
                include: {
                  event: {
                    select: {
                      title: true,
                      keyName: true,
                      eventType: true,
                      startDate: true,
                      endDate: true,
                      location: true,
                      days: true,
                      startTime: true,
                      endTime: true,
                      confirmationEmailSubject: true,
                      confirmationEmailBody: true,
                    },
                  },
                },
              })

              // send email confirmation for single ticket
              if (user && user.email && ticket) {
                const pricePaid = chargedAmount / 100
                const perSessionPrice = Number(ticket.price) || 0
                const firstName = user.name?.split(' ')[0] || 'Valued Customer'

                console.log('sending email confirmation for customer:', firstName)
                const singleTicketSeatNumber = (() => {
                  if (metadata.seatNumbers) {
                    try {
                      const parsed = JSON.parse(metadata.seatNumbers as string)
                      return Array.isArray(parsed)
                        ? parsed.join(', ')
                        : metadata.seatNumber
                    } catch (e) {
                      console.error('Error parsing seatNumbers in email:', e)
                      return metadata.seatNumber
                    }
                  }
                  return metadata.seatNumber
                })()
                const singleTicketPayload = {
                  ticketType: ticket.type,
                  pricePaid,
                  quantity: quantity || 1,
                  currency: ticket.currency || 'CAD',
                  ticketImageUrl: ticket.imageUrl,
                  perSessionPrice,
                  payTotalNumber: ticket.payTotalNumber,
                  eventTitle: ticket.event.title,
                  seatNumber: singleTicketSeatNumber,
                  eventStartDate: ticket.event.startDate,
                  eventEndDate: ticket.event.endDate,
                  eventLocation: ticket.event.location,
                  eventStartTime: ticket.event.startTime,
                  eventEndTime: ticket.event.endTime,
                  customSubject: ticket.event.confirmationEmailSubject,
                  customBody: ticket.event.confirmationEmailBody,
                  guestName: user.name || guestName || undefined,
                }
                const primaryEmailSingle = user.email.trim()
                const payerUserIdSingle =
                  metadata.userId && metadata.userId.trim() !== ''
                    ? metadata.userId.trim()
                    : null
                const formAccessReferenceSingle =
                  paymentId || createdEventPaymentIds[0] || null
                const eventFormExistsSingle = metadata.eventId
                  ? !!(await prisma.eventForm.findFirst({
                      where: { eventId: metadata.eventId },
                      select: { id: true },
                    }))
                  : false
                const singleTicketRecipients: {
                  to: string
                  firstName: string
                  formLink?: string
                  /** Index of the QR ticket reserved for this guest (purchaser: none) */
                  ticketSlot?: number
                }[] = [
                  {
                    to: primaryEmailSingle,
                    firstName,
                  },
                ]
                if (otherGuestsInfo?.length) {
                  for (const [guestIndex, g] of otherGuestsInfo.entries()) {
                    const email = g.email?.trim()
                    if (!email) continue
                    if (email.toLowerCase() === primaryEmailSingle.toLowerCase())
                      continue
                    const formLink =
                      eventFormExistsSingle &&
                      ticket.event.keyName &&
                      (payerUserIdSingle || formAccessReferenceSingle)
                        ? buildPostPaymentFormLink({
                            userId: payerUserIdSingle,
                            paymentReference: formAccessReferenceSingle,
                            eventKeyName: ticket.event.keyName,
                            eventType: ticket.event.eventType,
                            guestEmail: email,
                          })
                        : undefined
                    singleTicketRecipients.push({
                      to: email,
                      firstName: g.name?.split(' ')[0] || 'Valued Customer',
                      formLink,
                      // Ticket 0 is the purchaser's; guest N gets ticket N
                      ticketSlot: guestIndex + 1,
                    })
                  }
                }
                const seenSingleEmails = new Set<string>()
                const uniqueSingleRecipients = singleTicketRecipients.filter(
                  (r) => {
                    const key = r.to.toLowerCase()
                    if (seenSingleEmails.has(key)) return false
                    seenSingleEmails.add(key)
                    return true
                  }
                )
                const singleQrAttachments =
                  issuedTicketsForEmail.length > 0
                    ? await buildTicketQrAttachments(
                        issuedTicketsForEmail,
                        ticket.type
                      )
                    : []
                // Each guest gets only their own QR; the purchaser keeps their
                // own plus any ticket not claimed by an emailed guest.
                const singleGuestRecipients = uniqueSingleRecipients.filter(
                  (r) => r.ticketSlot !== undefined
                )
                const singleQrSplit = splitQrAttachments(
                  singleQrAttachments,
                  singleGuestRecipients.map((r) => r.ticketSlot as number)
                )
                const singleQrByRecipient = new Map(
                  singleGuestRecipients.map((r, i) => [
                    r.to,
                    singleQrSplit.guests[i],
                  ])
                )
                const singleSendResults = await Promise.allSettled(
                  uniqueSingleRecipients.map((r) =>
                    sendEmailWithRetry(() =>
                      sendPaymentConfirmationEmail({
                        ...singleTicketPayload,
                        firstName: r.firstName,
                        to: r.to,
                        formLink: r.formLink,
                        qrAttachments:
                          r.ticketSlot === undefined
                            ? singleQrSplit.purchaser
                            : (singleQrByRecipient.get(r.to) ?? []),
                      })
                    )
                  )
                )
                const failedSingleSends = singleSendResults.filter(
                  (result) => result.status === 'rejected'
                )
                if (failedSingleSends.length > 0) {
                  throw new Error(
                    `${failedSingleSends.length} ticket confirmation email(s) failed after retries`
                  )
                }
              }
            }
          }

          // Membership confirmation email (no event / ticket details)
          if (metadata.type === 'Membership' && user && user.email) {
            const pricePaid = chargedAmount / 100
            const firstName = user.name?.split(' ')[0] || 'Valued Customer'

            await sendSubscriptionConfirmationEmail({
              firstName,
              to: user.email,
              pricePaid,
              currency: 'CAD',
              subscriptionExpiresAt: expiresAt || null,
            })
          }
        } catch (emailError) {
          // Log email error but don't fail the webhook
          console.error('[PAYMENT_CONFIRMATION_EMAIL_ERROR]', emailError)
        }
      }
      
      
      // Refresh cached payment queries after persistence succeeds.
      revalidateTag('payments')

      // Mark durable checkout data as consumed.
      if (metadata?.checkoutDataId) {
        try {
          await prisma.checkoutSessionData.update({
            where: { id: metadata.checkoutDataId },
            data: { status: 'COMPLETED' },
          })
        } catch (e) {
          // Log error but don't fail webhook if status update fails
          console.error('[WEBHOOK_ERROR] Failed to update CheckoutSessionData status:', e)
        }
      }

      // Activate membership details after a successful membership payment.
      if (metadata.type === 'Membership') {
        await prisma.user.update({
          where: { id: metadata.userId },
          data: {
            subscribedAt: new Date(),
            subscribeExpires: expiresAt,
            stripeSubscriptionId: subscriptionId,
          },
        })

        // Preserve metadata for future subscription renewal invoices.
        if (subscriptionId) {
          await updateSubscriptionMetadata(subscriptionId, metadata)
        }
      }
    } catch (error) {
      console.error('[PRISMA_CREATE_PAYMENT_ERROR]', error)
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to save payment record to database'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  } else {
    console.log('Not supported event type', event.type)
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
