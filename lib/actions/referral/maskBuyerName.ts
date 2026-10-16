/**
 * Show part of a buyer name and hide the middle of each word.
 * "Nguyen Van" -> "N****n V*n"
 */
export function maskBuyerName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'Guest'
  return trimmed.split(/\s+/).map(maskNamePart).join(' ')
}

function maskNamePart(part: string): string {
  if (part.length <= 1) return '*'
  if (part.length === 2) return `${part[0]}*`
  const hidden = part.length - 2
  return `${part[0]}${'*'.repeat(hidden)}${part[part.length - 1]}`
}
