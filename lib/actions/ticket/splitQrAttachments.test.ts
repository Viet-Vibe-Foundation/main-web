import { describe, expect, test } from 'vitest'
import { splitQrAttachments } from './splitQrAttachments'

describe('splitQrAttachments', () => {
  test('gives the purchaser everything when there are no guests', () => {
    expect(splitQrAttachments(['a', 'b'], [])).toEqual({
      purchaser: ['a', 'b'],
      guests: [],
    })
  })

  test('gives each guest exactly one ticket and the purchaser the rest', () => {
    expect(splitQrAttachments(['a', 'b', 'c', 'd'], [1, 2])).toEqual({
      purchaser: ['a', 'd'],
      guests: [['b'], ['c']],
    })
  })

  test('keeps the ticket with the purchaser when a guest has no email', () => {
    // Guest #1 has no email, so only guest #2 (ticket index 2) is a recipient.
    expect(splitQrAttachments(['a', 'b', 'c'], [2])).toEqual({
      purchaser: ['a', 'b'],
      guests: [['c']],
    })
  })

  test('guests without a matching ticket receive no QR and nothing is lost', () => {
    expect(splitQrAttachments(['a'], [1, 2])).toEqual({
      purchaser: ['a'],
      guests: [[], []],
    })
  })

  test('never hands the same ticket to two recipients', () => {
    expect(splitQrAttachments(['a', 'b'], [1, 1])).toEqual({
      purchaser: ['a'],
      guests: [['b'], []],
    })
  })
})
