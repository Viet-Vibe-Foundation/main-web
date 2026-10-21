import { describe, expect, test } from 'vitest'
import {
  selectionRequirementLabel,
  validateCastSelection,
  validateSelectionLimits,
} from './selectionLimits'

describe('validateSelectionLimits', () => {
  test('accepts a single-choice poll', () => {
    expect(validateSelectionLimits(1, 1, 4)).toEqual({
      ok: true,
      minSelections: 1,
      maxSelections: 1,
    })
  })

  test('rejects a minimum above the maximum', () => {
    expect(validateSelectionLimits(3, 2, 5).ok).toBe(false)
  })

  test('rejects a maximum past the number of options', () => {
    const result = validateSelectionLimits(1, 6, 5)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/number of options/)
    }
  })

  test('rejects zero, fractions, and negatives', () => {
    expect(validateSelectionLimits(0, 2, 4).ok).toBe(false)
    expect(validateSelectionLimits(1.5, 2, 4).ok).toBe(false)
    expect(validateSelectionLimits(-1, 2, 4).ok).toBe(false)
  })
})

describe('validateCastSelection', () => {
  const options = ['a', 'b', 'c', 'd']

  test('requires a count inside the range and drops duplicates', () => {
    expect(validateCastSelection(['a', 'a', 'b'], options, 2, 3)).toEqual({
      ok: true,
      optionIds: ['a', 'b'],
    })
    expect(validateCastSelection(['a'], options, 2, 3).ok).toBe(false)
    expect(validateCastSelection(['a', 'b', 'c', 'd'], options, 2, 3).ok).toBe(
      false
    )
  })

  test('rejects an option that is not on the poll', () => {
    expect(validateCastSelection(['a', 'nope'], options, 1, 2).ok).toBe(false)
  })
})

describe('selectionRequirementLabel', () => {
  test('describes exact, upper-bound, and range limits', () => {
    expect(selectionRequirementLabel(1, 1)).toBe('Choose 1 option')
    expect(selectionRequirementLabel(3, 3)).toBe('Choose exactly 3 options')
    expect(selectionRequirementLabel(1, 4)).toBe('Choose up to 4 options')
    expect(selectionRequirementLabel(2, 4)).toBe('Choose 2 to 4 options')
  })
})
