import { describe, expect, test, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockCanAccess = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()

vi.mock('@/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/actions/payment/canAccessEventPaymentData', () => ({
  canAccessEventPaymentData: (...args: unknown[]) => mockCanAccess(...args),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedTicket: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}))

import {
  checkInTicketByQr,
  lookupTicketByQr,
} from './checkInTicket'

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issued_1',
    qrToken: 'vvf_ticket_abc',
    seatLabel: null,
    checkedInAt: null,
    eventId: 'evt_1',
    paymentId: 'pay_1',
    checkedInBy: null,
    event: { title: 'Concert Night' },
    eventTicket: { type: 'GA' },
    payment: {
      guestName: 'Ada',
      guestEmail: 'ada@example.com',
      quantity: 1,
      refunded: false,
      user: null,
    },
    ...overrides,
  }
}

describe('checkInTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({
      user: { id: 'staff_1', role: ['ADMIN'] },
    })
    mockCanAccess.mockResolvedValue(true)
  })

  test('lookupTicketByQr returns ticket for staff', async () => {
    mockFindUnique.mockResolvedValue(ticketRow())
    const result = await lookupTicketByQr('vvf_ticket_abc')
    expect(result.success).toBe(true)
    expect(result.ticket?.guestName).toBe('Ada')
    expect(result.ticket?.eventTitle).toBe('Concert Night')
  })

  test('checkInTicketByQr marks ticket checked in', async () => {
    mockFindUnique
      .mockResolvedValueOnce(ticketRow())
      .mockResolvedValueOnce(
        ticketRow({
          checkedInAt: new Date('2026-10-08T12:00:00Z'),
          checkedInBy: { name: 'Staff' },
        })
      )
    mockUpdate.mockResolvedValue({
      qrToken: 'vvf_ticket_abc',
    })

    const result = await checkInTicketByQr('vvf_ticket_abc')
    expect(result.success).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'issued_1' },
        data: expect.objectContaining({
          checkedInById: 'staff_1',
        }),
      })
    )
  })

  test('checkInTicketByQr rejects already checked-in tickets', async () => {
    mockFindUnique.mockResolvedValue(
      ticketRow({
        checkedInAt: new Date('2026-10-01T10:00:00Z'),
        checkedInBy: { name: 'Host' },
      })
    )

    const result = await checkInTicketByQr('vvf_ticket_abc')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Already checked in/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test('checkInTicketByQr rejects refunded tickets', async () => {
    mockFindUnique.mockResolvedValue(
      ticketRow({
        payment: {
          guestName: 'Ada',
          guestEmail: 'ada@example.com',
          quantity: 1,
          refunded: true,
          user: null,
        },
      })
    )

    const result = await checkInTicketByQr('vvf_ticket_abc')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/refunded/i)
  })

  test('rejects unauthenticated users', async () => {
    mockAuth.mockResolvedValue(null)
    const result = await lookupTicketByQr('vvf_ticket_abc')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unauthorized')
  })
})
