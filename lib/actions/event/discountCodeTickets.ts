/**
 * Code discounts store a ticket cap in `maxUses`.
 * One completed order used to consume a single use and discount every ticket in it.
 * The cap is now the number of tickets that receive the code.
 */

export type CodeLimitApplication =
  | { kind: 'none' }
  | { kind: 'percent-on-top'; codePercent: number }
  | { kind: 'percent-replaces'; codePercent: number }
  /** Code percent wins, but a separate fixed amount still applies to the cart. */
  | { kind: 'percent-swap-keep-amount'; codePercent: number }
  | { kind: 'amount-on-top'; codeAmount: number }
  | { kind: 'amount-replaces'; codeAmount: number }

function nearly(a: number, b: number) {
  return Math.abs(a - b) < 0.001
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

/** Null means the code has no ticket cap. */
export function ticketsCoveredByCode(
  cartTickets: number,
  ticketsRemaining: number | null
): number {
  const cart = Number.isFinite(cartTickets) ? Math.max(0, Math.floor(cartTickets)) : 0
  if (ticketsRemaining == null || !Number.isFinite(ticketsRemaining)) return cart
  return Math.min(cart, Math.max(0, Math.floor(ticketsRemaining)))
}

/**
 * Classify how the checkout folded a code into the cart-wide percent and amount.
 * Callers still run that logic; this only describes the result so a ticket cap
 * can reprice the units the code does not cover.
 */
export function describeCodeApplication(input: {
  codeApplied: boolean
  codeUnit: 'percentage' | 'amount'
  codeValue: number
  percentBefore: number
  amountBefore: number
  percentAfter: number
  amountAfter: number
}): CodeLimitApplication {
  if (!input.codeApplied) return { kind: 'none' }

  const {
    codeUnit,
    codeValue,
    percentBefore,
    amountBefore,
    percentAfter,
    amountAfter,
  } = input

  if (codeUnit === 'percentage') {
    if (
      nearly(percentAfter, percentBefore + codeValue) &&
      nearly(amountAfter, amountBefore)
    ) {
      return { kind: 'percent-on-top', codePercent: codeValue }
    }
    if (
      nearly(percentAfter, codeValue) &&
      nearly(amountAfter, amountBefore)
    ) {
      return { kind: 'percent-swap-keep-amount', codePercent: codeValue }
    }
    if (nearly(percentAfter, codeValue) && nearly(amountAfter, 0)) {
      return { kind: 'percent-replaces', codePercent: codeValue }
    }
    return {
      kind: 'percent-on-top',
      codePercent: Math.max(0, percentAfter - percentBefore),
    }
  }

  if (
    nearly(amountAfter, amountBefore + codeValue) &&
    nearly(percentAfter, percentBefore)
  ) {
    return { kind: 'amount-on-top', codeAmount: codeValue }
  }
  if (nearly(amountAfter, codeValue) && nearly(percentAfter, 0)) {
    return { kind: 'amount-replaces', codeAmount: codeValue }
  }
  return {
    kind: 'amount-on-top',
    codeAmount: Math.max(0, amountAfter - amountBefore),
  }
}

/**
 * Cart total after member, student, and quantity-range prices.
 * The code discount applies only to the first `ticketsCovered` units.
 * Other event discounts still apply to the tickets the code does not cover.
 */
export function cartTotalWithCodeTicketLimit(params: {
  unitPrices: number[]
  nonCodePercent: number
  nonCodeAmount: number
  application: CodeLimitApplication
  ticketsCovered: number
}): number {
  const coveredCount = Math.max(
    0,
    Math.min(Math.floor(params.ticketsCovered), params.unitPrices.length)
  )
  const nonCodePercent = clampPercent(params.nonCodePercent)
  const nonCodeAmount = Math.max(0, params.nonCodeAmount)
  const application = params.application

  const afterPercent = params.unitPrices.map((base, index) => {
    const covered = index < coveredCount && application.kind !== 'none'
    let percent = nonCodePercent
    if (covered && application.kind === 'percent-on-top') {
      percent = nonCodePercent + application.codePercent
    } else if (
      covered &&
      (application.kind === 'percent-replaces' ||
        application.kind === 'percent-swap-keep-amount')
    ) {
      percent = application.codePercent
    } else if (covered && application.kind === 'amount-replaces') {
      percent = 0
    }
    const price = Math.max(0, base) * (1 - clampPercent(percent) / 100)
    return roundMoney(price)
  })

  const subtotal = sum(afterPercent)
  const uncoveredSubtotal = sum(afterPercent.slice(coveredCount))
  const coveredSubtotal = sum(afterPercent.slice(0, coveredCount))
  let amountOff = nonCodeAmount

  if (application.kind === 'percent-replaces' && coveredCount > 0) {
    amountOff = Math.min(nonCodeAmount, uncoveredSubtotal)
  } else if (application.kind === 'percent-swap-keep-amount') {
    amountOff = Math.min(nonCodeAmount, subtotal)
  } else if (application.kind === 'amount-on-top' && coveredCount > 0) {
    amountOff = nonCodeAmount + Math.max(0, application.codeAmount)
  } else if (application.kind === 'amount-replaces' && coveredCount > 0) {
    amountOff =
      Math.min(nonCodeAmount, uncoveredSubtotal) +
      Math.min(Math.max(0, application.codeAmount), coveredSubtotal)
  }

  return roundMoney(Math.max(0, subtotal - amountOff))
}
