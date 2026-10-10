import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockFindUnique = vi.fn()
const mockCanAccess = vi.fn()

vi.mock('@/lib/actions/payment/canAccessEventPaymentData', () => ({
  canAccessEventPaymentData: (...args: unknown[]) => mockCanAccess(...args),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    event: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}))

import { getEventKeyNameById } from './getEvent'

describe('getEventKeyNameById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCanAccess.mockResolvedValue(true)
  })

  test('returns null without querying when the user cannot access the event', async () => {
    mockCanAccess.mockResolvedValue(false)
    await expect(getEventKeyNameById('evt_other')).resolves.toBeNull()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  test('returns keyName for an event id', async () => {
    mockFindUnique.mockResolvedValue({ keyName: 'summer-concert' })
    await expect(getEventKeyNameById('evt_1')).resolves.toBe('summer-concert')
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'evt_1' },
      select: { keyName: true },
    })
  })

  test('returns null when event is missing', async () => {
    mockFindUnique.mockResolvedValue(null)
    await expect(getEventKeyNameById('missing')).resolves.toBeNull()
  })
})
