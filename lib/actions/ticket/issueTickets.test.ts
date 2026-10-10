import { describe, expect, test, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    issuedTicket: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  createQrToken,
  issueTicketsForPayment,
  parseQrPayload,
} from './issueTickets'

const mockCreateMany = vi.mocked(prisma.issuedTicket.createMany)
const mockFindMany = vi.mocked(prisma.issuedTicket.findMany)

describe('issueTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('createQrToken returns prefixed unguessable token', () => {
    const token = createQrToken()
    expect(token.startsWith('vvf_ticket_')).toBe(true)
    expect(token.length).toBeGreaterThan(20)
  })

  test('parseQrPayload accepts raw token, URL param, and bare random part', () => {
    const token = 'vvf_ticket_abc123XYZ-_'
    expect(parseQrPayload(token)).toBe(token)
    expect(
      parseQrPayload(`https://vietvibe.org/checkin?token=${token}`)
    ).toBe(token)
    expect(parseQrPayload('abcdefghijklmnopqrstuvwx')).toBe(
      'vvf_ticket_abcdefghijklmnopqrstuvwx'
    )
    expect(parseQrPayload('not-valid')).toBeNull()
  })

  test('issueTicketsForPayment creates one ticket per quantity', async () => {
    mockCreateMany.mockResolvedValue({ count: 3 })
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }, { id: '3' }] as never)

    const result = await issueTicketsForPayment({
      paymentId: 'pay_1',
      eventId: 'evt_1',
      eventTicketId: 'tkt_1',
      quantity: 3,
    })

    expect(mockCreateMany).toHaveBeenCalledOnce()
    const createArgs = mockCreateMany.mock.calls[0]?.[0]
    expect(createArgs).toBeDefined()
    const data = createArgs!.data as Array<{
      paymentId: string
      qrToken: string
      seatLabel: string | null
    }>
    expect(data).toHaveLength(3)
    expect(data.every((d) => d.paymentId === 'pay_1')).toBe(true)
    expect(data.every((d) => d.qrToken.startsWith('vvf_ticket_'))).toBe(true)
    expect(result).toHaveLength(3)
  })

  test('issueTicketsForPayment creates one ticket per seat label', async () => {
    mockCreateMany.mockResolvedValue({ count: 2 })
    mockFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }] as never)

    await issueTicketsForPayment({
      paymentId: 'pay_2',
      eventId: 'evt_1',
      quantity: 1,
      seatNumber: 'A1, A2',
    })

    const createArgs = mockCreateMany.mock.calls[0]?.[0]
    expect(createArgs).toBeDefined()
    const data = createArgs!.data as Array<{
      seatLabel: string | null
    }>
    expect(data).toHaveLength(2)
    expect(data[0]?.seatLabel).toBe('A1')
    expect(data[1]?.seatLabel).toBe('A2')
  })

  test('issueTicketsForPayment reuses existing tickets instead of duplicating', async () => {
    const existing = [{ id: '1' }, { id: '2' }] as never
    mockFindMany.mockResolvedValue(existing)

    const result = await issueTicketsForPayment({
      paymentId: 'pay_3',
      eventId: 'evt_1',
      quantity: 2,
    })

    expect(mockCreateMany).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })

  test('issueTicketsForPayment only creates the missing tickets', async () => {
    mockCreateMany.mockResolvedValue({ count: 1 })
    mockFindMany
      .mockResolvedValueOnce([{ id: '1' }] as never)
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }] as never)

    await issueTicketsForPayment({
      paymentId: 'pay_4',
      eventId: 'evt_1',
      quantity: 1,
      seatNumber: 'B1, B2',
    })

    const data = mockCreateMany.mock.calls[0]?.[0]!.data as Array<{
      seatLabel: string | null
    }>
    expect(data).toHaveLength(1)
    expect(data[0]?.seatLabel).toBe('B2')
  })
})
