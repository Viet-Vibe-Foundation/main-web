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
  /** Maximum completed orders that may redeem this code. Omit or null for unlimited. */
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
    }
  | {
      valid: false
      reason:
        | 'Event not found'
        | 'No code discounts found'
        | 'Invalid code'
        | 'Code usage limit reached'
    }

/** One completed checkout counts as one use, even when it creates several payment rows. */
async function countEventCodeDiscountUses(
  eventId: string,
  code: string
): Promise<number> {
  const normalized = code.trim().toLowerCase()
  const rows = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      SELECT COUNT(DISTINCT COALESCE("stripePaymentId", "id"))::int AS count
      FROM "Payment"
      WHERE "eventId" = ${eventId}
        AND "refunded" = false
        AND jsonb_typeof("discountApplied"::jsonb) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("discountApplied"::jsonb) AS elem
          WHERE elem->>'kind' = 'discount_code'
            AND lower(trim(elem->>'code')) = ${normalized}
        )
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
  if (maxUses !== null && Number.isFinite(maxUses) && maxUses > 0) {
    const used = await countEventCodeDiscountUses(params.eventId, code)
    if (used >= maxUses) {
      return { valid: false, reason: 'Code usage limit reached' }
    }
  }

  return {
    valid: true,
    code,
    discountAmount,
    discountUnit: unit,
    cannotBeStacked: Boolean(match.cannotBeStacked),
  }
}


