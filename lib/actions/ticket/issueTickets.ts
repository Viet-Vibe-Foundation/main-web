import 'server-only'

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import type { IssuedTicket, Prisma } from '@prisma/client'

const QR_TOKEN_PREFIX = 'vvf_ticket_'

export function createQrToken(): string {
  return `${QR_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export function parseQrPayload(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  // Accept raw token or a URL that ends with / contains the token
  if (value.startsWith(QR_TOKEN_PREFIX)) {
    return value
  }

  try {
    const url = new URL(value)
    const tokenParam = url.searchParams.get('token')
    if (tokenParam?.startsWith(QR_TOKEN_PREFIX)) {
      return tokenParam
    }
  } catch {
    // not a URL
  }

  // Allow scanning just the random part if staff pasted it
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) {
    return `${QR_TOKEN_PREFIX}${value}`
  }

  return null
}

export type IssueTicketsForPaymentInput = {
  paymentId: string
  eventId: string
  eventTicketId?: string | null
  quantity: number
  seatNumber?: string | null
}

/**
 * Create one IssuedTicket per admission unit.
 * Seated purchases: one ticket per seat label.
 * Non-seated: one ticket per quantity.
 */
export async function issueTicketsForPayment(
  input: IssueTicketsForPaymentInput,
  tx?: Prisma.TransactionClient
): Promise<IssuedTicket[]> {
  const db = tx ?? prisma
  const quantity = Math.max(1, Math.floor(input.quantity) || 1)

  const seatLabels =
    input.seatNumber
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? []

  const count = seatLabels.length > 0 ? seatLabels.length : quantity

  const data = Array.from({ length: count }, (_, index) => ({
    qrToken: createQrToken(),
    paymentId: input.paymentId,
    eventId: input.eventId,
    eventTicketId: input.eventTicketId || null,
    seatLabel: seatLabels[index] || null,
  }))

  await db.issuedTicket.createMany({ data })

  return db.issuedTicket.findMany({
    where: { paymentId: input.paymentId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function issueTicketsForPayments(
  payments: IssueTicketsForPaymentInput[]
): Promise<IssuedTicket[]> {
  const issued: IssuedTicket[] = []
  for (const payment of payments) {
    if (!payment.eventId) continue
    const tickets = await issueTicketsForPayment(payment)
    issued.push(...tickets)
  }
  return issued
}
