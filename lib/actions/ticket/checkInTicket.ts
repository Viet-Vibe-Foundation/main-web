'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { Role } from '@prisma/client'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'
import { parseQrPayload } from '@/lib/actions/ticket/issueTickets'

export type IssuedTicketLookup = {
  id: string
  qrToken: string
  seatLabel: string | null
  checkedInAt: Date | null
  checkedInByName: string | null
  eventId: string
  eventTitle: string
  ticketType: string | null
  guestName: string | null
  guestEmail: string | null
  quantity: number
  refunded: boolean
  paymentId: string
}

function unauthorizedResult(message = 'Unauthorized') {
  return { success: false as const, error: message, ticket: null }
}

async function requireStaffSession() {
  const session = await auth()
  const userId = session?.user?.id
  const roles = (session?.user?.role ?? []) as Role[]

  if (!userId) {
    return null
  }

  const allowed =
    roles.includes(Role.ADMIN) ||
    roles.includes(Role.SUPERADMIN) ||
    roles.includes(Role.HOST)

  if (!allowed) {
    return null
  }

  return { userId, roles }
}

async function loadTicketByToken(qrToken: string): Promise<IssuedTicketLookup | null> {
  const ticket = await prisma.issuedTicket.findUnique({
    where: { qrToken },
    select: {
      id: true,
      qrToken: true,
      seatLabel: true,
      checkedInAt: true,
      eventId: true,
      paymentId: true,
      checkedInBy: { select: { name: true } },
      event: { select: { title: true } },
      eventTicket: { select: { type: true } },
      payment: {
        select: {
          guestName: true,
          guestEmail: true,
          quantity: true,
          refunded: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  })

  if (!ticket) return null

  return {
    id: ticket.id,
    qrToken: ticket.qrToken,
    seatLabel: ticket.seatLabel,
    checkedInAt: ticket.checkedInAt,
    checkedInByName: ticket.checkedInBy?.name ?? null,
    eventId: ticket.eventId,
    eventTitle: ticket.event.title,
    ticketType: ticket.eventTicket?.type ?? null,
    guestName: ticket.payment.guestName || ticket.payment.user?.name || null,
    guestEmail: ticket.payment.guestEmail || ticket.payment.user?.email || null,
    quantity: ticket.payment.quantity,
    refunded: ticket.payment.refunded,
    paymentId: ticket.paymentId,
  }
}

export async function lookupTicketByQr(rawPayload: string) {
  const staff = await requireStaffSession()
  if (!staff) return unauthorizedResult()

  const qrToken = parseQrPayload(rawPayload)
  if (!qrToken) {
    return { success: false as const, error: 'Invalid QR code', ticket: null }
  }

  const ticket = await loadTicketByToken(qrToken)
  if (!ticket) {
    return { success: false as const, error: 'Ticket not found', ticket: null }
  }

  const canAccess = await canAccessEventPaymentData(ticket.eventId)
  if (!canAccess) {
    return unauthorizedResult('You do not have access to this event')
  }

  return { success: true as const, error: null, ticket }
}

export async function checkInTicketByQr(rawPayload: string) {
  const staff = await requireStaffSession()
  if (!staff) return unauthorizedResult()

  const qrToken = parseQrPayload(rawPayload)
  if (!qrToken) {
    return { success: false as const, error: 'Invalid QR code', ticket: null }
  }

  const existing = await loadTicketByToken(qrToken)
  if (!existing) {
    return { success: false as const, error: 'Ticket not found', ticket: null }
  }

  const canAccess = await canAccessEventPaymentData(existing.eventId)
  if (!canAccess) {
    return unauthorizedResult('You do not have access to this event')
  }

  if (existing.refunded) {
    return {
      success: false as const,
      error: 'This ticket was refunded and cannot be checked in',
      ticket: existing,
    }
  }

  if (existing.checkedInAt) {
    return {
      success: false as const,
      error: `Already checked in at ${existing.checkedInAt.toLocaleString()}${
        existing.checkedInByName ? ` by ${existing.checkedInByName}` : ''
      }`,
      ticket: existing,
    }
  }

  const updated = await prisma.issuedTicket.update({
    where: { id: existing.id },
    data: {
      checkedInAt: new Date(),
      checkedInById: staff.userId,
    },
  })

  const ticket = await loadTicketByToken(updated.qrToken)

  return {
    success: true as const,
    error: null,
    ticket,
    message: 'Ticket checked in successfully',
  }
}

export async function getEventCheckInStats(eventId: string) {
  const staff = await requireStaffSession()
  if (!staff) return null

  const canAccess = await canAccessEventPaymentData(eventId)
  if (!canAccess) return null

  const [total, checkedIn] = await Promise.all([
    prisma.issuedTicket.count({
      where: { eventId, payment: { refunded: false } },
    }),
    prisma.issuedTicket.count({
      where: {
        eventId,
        checkedInAt: { not: null },
        payment: { refunded: false },
      },
    }),
  ])

  return { total, checkedIn, remaining: Math.max(0, total - checkedIn) }
}
