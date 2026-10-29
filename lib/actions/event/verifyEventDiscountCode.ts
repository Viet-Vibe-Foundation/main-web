'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

type EventCodeDiscount = {
  code?: string | null
  // New format
  discountAmount?: number | null
  discountUnit?: 'percentage' | 'amount' | null
  // Legacy field for backward compatibility
  percentage?: number | null
  /** Maximum tickets this code can discount. Omit or null for unlimited. */
  maxUses?: number | null
  cannotBeStacked?: boolean | null
  type?: string
}

export type VerifiedEventCodeDiscount =
  | {
      valid: true
      code: string
      discountAmount: number
      discountUnit: 'percentage' | 'amount'
      cannotBeStacked: boolean
      /** Null when the code does not cap how many tickets it can discount. */
      ticketsRemaining: number | null
    }
  | {
      valid: false
      reason:
        | 'Event not found'
        | 'No code discounts found'
        | 'Invalid code'
        | 'Code usage limit reached'
    }

/**
 * Tickets already discounted by this code.
 * A checkout stores `ticketsCovered` once on every payment row, so that value
 * is taken once per checkout. Older rows have no cap and discounted the whole order.
 */
async function countEventCodeDiscountTickets(
  eventId: string,
  code: string
): Promise<number> {
  const normalized = code.trim().toLowerCase()
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN covered_explicit IS NOT NULL THEN covered_explicit
          ELSE qty
        END
      ), 0)::int AS count
      FROM (
        SELECT
          SUM(GREATEST(COALESCE(p."quantity", 1), 0))::int AS qty,
          MAX(
            CASE
              WHEN elem->>'ticketsCovered' ~ '^[0-9]+$'
              THEN (elem->>'ticketsCovered')::int
              ELSE NULL
            END
          ) AS covered_explicit
        FROM "Payment" p
        CROSS JOIN LATERAL jsonb_array_elements(p."discountApplied"::jsonb) AS elem
        WHERE p."eventId" = ${eventId}
          AND p."refunded" = false
          AND jsonb_typeof(p."discountApplied"::jsonb) = 'array'
          AND elem->>'kind' = 'discount_code'
          AND lower(trim(elem->>'code')) = ${normalized}
        GROUP BY COALESCE(p."stripePaymentId", p."id")
      ) AS checkouts
    `
  )
  return Number(rows[0]?.count ?? 0)
}

export async function verifyEventDiscountCode(params: {
  eventId: string
  code: string
}): Promise<VerifiedEventCodeDiscount> {
  const code = params.code.trim()
  if (!code) {
    return { valid: false, reason: 'Invalid code' }
  }

  const event = await prisma.event.findUnique({
    where: { id: params.eventId },
    select: { eventCodeDiscounts: true },
  })

  if (!event) return { valid: false, reason: 'Event not found' }
  if (!event.eventCodeDiscounts || !Array.isArray(event.eventCodeDiscounts)) {
    return { valid: false, reason: 'No code discounts found' }
  }

  const normalized = code.toLowerCase()
  const match = (event.eventCodeDiscounts as unknown as EventCodeDiscount[]).find(
    (d) => (d?.code ?? '').toString().trim().toLowerCase() === normalized
  )

  if (!match) return { valid: false, reason: 'Invalid code' }

  // Support new JSON format (discountAmount + discountUnit) with
  // backward compatibility for legacy `percentage` field.
  const rawAmount =
    match.discountAmount !== undefined && match.discountAmount !== null
      ? match.discountAmount
      : match.percentage ?? 0

  const unit = (match.discountUnit ?? 'percentage') as
    | 'percentage'
    | 'amount'

  if (unit !== 'percentage' && unit !== 'amount') {
    return { valid: false, reason: 'Invalid code' }
  }

  const discountAmount = Number(rawAmount ?? 0)
  if (!Number.isFinite(discountAmount) || discountAmount <= 0) {
    return { valid: false, reason: 'Invalid code' }
  }

  const maxUses =
    match.maxUses !== undefined && match.maxUses !== null
      ? Number(match.maxUses)
      : null
  let ticketsRemaining: number | null = null
  if (maxUses !== null && Number.isFinite(maxUses) && maxUses > 0) {
    const used = await countEventCodeDiscountTickets(params.eventId, code)
    ticketsRemaining = Math.max(0, Math.floor(maxUses) - used)
    if (ticketsRemaining <= 0) {
      return { valid: false, reason: 'Code usage limit reached' }
    }
  }

  return {
    valid: true,
    code,
    discountAmount,
    discountUnit: unit,
    cannotBeStacked: Boolean(match.cannotBeStacked),
    ticketsRemaining,
  }
}


