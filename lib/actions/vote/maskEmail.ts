/**
 * Hide ~70% of characters in an email for public display.
 * Keeps ~30% visible (split across start and end).
 */
export function maskEmail(email: string): string {
  const value = email.trim()
  if (!value) return ''
  if (value.length <= 2) return '*'.repeat(value.length)

  const visibleCount = Math.max(2, Math.ceil(value.length * 0.3))
  const startCount = Math.ceil(visibleCount / 2)
  const endCount = Math.floor(visibleCount / 2)
  const hiddenCount = Math.max(0, value.length - startCount - endCount)

  return (
    value.slice(0, startCount) +
    '*'.repeat(hiddenCount) +
    (endCount > 0 ? value.slice(-endCount) : '')
  )
}

export function displayVoterLabel(ballot: {
  nickname: string | null
  voterEmail: string | null
}): string {
  if (ballot.nickname?.trim()) {
    return ballot.nickname.trim()
  }
  if (ballot.voterEmail?.trim()) {
    return maskEmail(ballot.voterEmail)
  }
  return 'Anonymous'
}
