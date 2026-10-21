export type SelectionLimitResult =
  | { ok: true; minSelections: number; maxSelections: number }
  | { ok: false; error: string }

/** Admin-facing check: whole numbers, min ≤ max, and max fits the option list. */
export function validateSelectionLimits(
  minSelections: number,
  maxSelections: number,
  optionCount: number
): SelectionLimitResult {
  if (
    !Number.isInteger(minSelections) ||
    !Number.isInteger(maxSelections) ||
    minSelections < 1 ||
    maxSelections < 1
  ) {
    return {
      ok: false,
      error:
        'Minimum and maximum selections must be whole numbers of at least 1',
    }
  }
  if (minSelections > maxSelections) {
    return {
      ok: false,
      error: 'Minimum selections cannot be greater than the maximum',
    }
  }
  if (maxSelections > optionCount) {
    return {
      ok: false,
      error: 'Maximum selections cannot be more than the number of options',
    }
  }
  return { ok: true, minSelections, maxSelections }
}

/** Short instruction shown to voters, e.g. "Choose 2 to 4 options". */
export function selectionRequirementLabel(
  minSelections: number,
  maxSelections: number
): string {
  if (minSelections === maxSelections) {
    return minSelections === 1
      ? 'Choose 1 option'
      : `Choose exactly ${minSelections} options`
  }
  if (minSelections <= 1) return `Choose up to ${maxSelections} options`
  return `Choose ${minSelections} to ${maxSelections} options`
}

export function validateCastSelection(
  optionIds: string[],
  validOptionIds: string[],
  minSelections: number,
  maxSelections: number
): { ok: true; optionIds: string[] } | { ok: false; error: string } {
  const unique = [...new Set(optionIds.filter((id) => id.trim().length > 0))]
  const valid = new Set(validOptionIds)
  if (unique.some((id) => !valid.has(id))) {
    return { ok: false, error: 'Invalid option' }
  }
  if (unique.length < minSelections || unique.length > maxSelections) {
    return {
      ok: false,
      error: `${selectionRequirementLabel(minSelections, maxSelections)}.`,
    }
  }
  return { ok: true, optionIds: unique }
}
