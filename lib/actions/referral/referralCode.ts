import { randomBytes } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeReferralCode(raw?: string | null): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 4 || code.length > 16) return null
  return code
}

export function normalizeBuyerEmail(raw?: string | null): string | null {
  const email = raw?.trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return email
}

export function generateReferralCode(): string {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return code
}

export function buildTicketReferralLink({
  eventKeyName,
  eventType,
  code,
  locale = 'en',
}: {
  eventKeyName: string
  eventType: string
  code: string
  locale?: string
}): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ??
    'https://www.vietvibe.org'
  const type = eventType.toLowerCase()
  return `${baseUrl}/${locale}/events/${type}/${eventKeyName}?ref=${encodeURIComponent(code)}`
}

export function sumCheckoutTicketQuantity(
  ticketMetadata:
    | Array<{ seatNumbers?: string[]; quantity?: number }>
    | null
    | undefined,
  fallbackQuantity?: number | null
): number {
  if (ticketMetadata && ticketMetadata.length > 0) {
    const total = ticketMetadata.reduce((sum, ticket) => {
      if (ticket.seatNumbers && ticket.seatNumbers.length > 0) {
        return sum + ticket.seatNumbers.length
      }
      return sum + (ticket.quantity || 1)
    }, 0)
    return Math.max(1, total)
  }
  return Math.max(1, fallbackQuantity || 1)
}
