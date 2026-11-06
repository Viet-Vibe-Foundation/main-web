import { describe, expect, test } from 'vitest'
import {
  cartTotalWithCodeTicketLimit,
  describeCodeApplication,
  ticketsCoveredByCode,
} from './discountCodeTickets'

describe('discount code ticket limit', () => {
  test('covers every ticket when the code has no cap', () => {
    expect(ticketsCoveredByCode(4, null)).toBe(4)
  })

  test('covers only the tickets still left on the code', () => {
    expect(ticketsCoveredByCode(5, 1)).toBe(1)
    expect(ticketsCoveredByCode(2, 5)).toBe(2)
    expect(ticketsCoveredByCode(3, 0)).toBe(0)
  })

  test('a percentage code discounts the capped tickets and leaves the rest at full price', () => {
    const total = cartTotalWithCodeTicketLimit({
      unitPrices: [100, 100, 100],
      nonCodePercent: 0,
      nonCodeAmount: 0,
      application: { kind: 'percent-on-top', codePercent: 50 },
      ticketsCovered: 1,
    })
    expect(total).toBe(250)
  })

  test('tickets the code does not cover keep the other percentage discount', () => {
    const total = cartTotalWithCodeTicketLimit({
      unitPrices: [100, 100],
      nonCodePercent: 10,
      nonCodeAmount: 0,
      application: { kind: 'percent-swap-keep-amount', codePercent: 50 },
      ticketsCovered: 1,
    })
    // 50% on the covered ticket, 10% on the other
    expect(total).toBe(140)
  })

  test('a stackable percentage is added only on the covered tickets', () => {
    const total = cartTotalWithCodeTicketLimit({
      unitPrices: [100, 100, 100],
      nonCodePercent: 10,
      nonCodeAmount: 0,
      application: { kind: 'percent-on-top', codePercent: 20 },
      ticketsCovered: 1,
    })
    // 70 + 90 + 90
    expect(total).toBe(250)
  })

  test('a fixed amount stays a single cart discount and does not repeat per ticket', () => {
    const total = cartTotalWithCodeTicketLimit({
      unitPrices: [40, 40, 40],
      nonCodePercent: 0,
      nonCodeAmount: 0,
      application: { kind: 'amount-on-top', codeAmount: 15 },
      ticketsCovered: 1,
    })
    expect(total).toBe(105)
  })

  test('describes a stackable percent as added on top', () => {
    expect(
      describeCodeApplication({
        codeApplied: true,
        codeUnit: 'percentage',
        codeValue: 20,
        percentBefore: 10,
        amountBefore: 0,
        percentAfter: 30,
        amountAfter: 0,
      })
    ).toEqual({ kind: 'percent-on-top', codePercent: 20 })
  })

  test('describes a winning non-stackable percent that keeps a fixed amount', () => {
    expect(
      describeCodeApplication({
        codeApplied: true,
        codeUnit: 'percentage',
        codeValue: 50,
        percentBefore: 10,
        amountBefore: 5,
        percentAfter: 50,
        amountAfter: 5,
      })
    ).toEqual({ kind: 'percent-swap-keep-amount', codePercent: 50 })
  })
})
