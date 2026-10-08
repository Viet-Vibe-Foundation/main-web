import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockFindUnique = vi.fn()

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
