export type ConfirmationEmailPlaceholderKey =
  | 'firstName'
  | 'guestName'
  | 'ticketType'
  | 'pricePaid'
  | 'quantity'
  | 'currency'
  | 'eventTitle'
  | 'seatNumber'
  | 'eventStartDate'
  | 'eventEndDate'
  | 'eventLocation'
  | 'eventStartTime'
  | 'eventEndTime'
  | 'formLink'
  | 'qrCodes'

export type ConfirmationEmailPlaceholder = {
  key: ConfirmationEmailPlaceholderKey
  label: string
  description: string
  /** Token staff type in the template, e.g. <<firstName>> */
  token: string
}

export const CONFIRMATION_EMAIL_PLACEHOLDERS: ConfirmationEmailPlaceholder[] = [
  {
    key: 'firstName',
    label: 'First name',
    description: 'Guest first name',
    token: '<<firstName>>',
  },
  {
    key: 'guestName',
    label: 'Full name',
    description: 'Guest full name',
    token: '<<guestName>>',
  },
  {
    key: 'ticketType',
    label: 'Ticket type',
    description: 'Purchased ticket type(s)',
    token: '<<ticketType>>',
  },
  {
    key: 'pricePaid',
    label: 'Price paid',
    description: 'Total amount paid',
    token: '<<pricePaid>>',
  },
  {
    key: 'quantity',
    label: 'Quantity',
    description: 'Number of tickets',
    token: '<<quantity>>',
  },
  {
    key: 'currency',
    label: 'Currency',
    description: 'e.g. CAD',
    token: '<<currency>>',
  },
  {
    key: 'eventTitle',
    label: 'Event title',
    description: 'Event name',
    token: '<<eventTitle>>',
  },
  {
    key: 'seatNumber',
    label: 'Seat number',
    description: 'Seat(s), if any',
    token: '<<seatNumber>>',
  },
  {
    key: 'eventStartDate',
    label: 'Start date',
    description: 'Event start date',
    token: '<<eventStartDate>>',
  },
  {
    key: 'eventEndDate',
    label: 'End date',
    description: 'Event end date',
    token: '<<eventEndDate>>',
  },
  {
    key: 'eventLocation',
    label: 'Location',
    description: 'Event location',
    token: '<<eventLocation>>',
  },
  {
    key: 'eventStartTime',
    label: 'Start time',
    description: 'Event start time',
    token: '<<eventStartTime>>',
  },
  {
    key: 'eventEndTime',
    label: 'End time',
    description: 'Event end time',
    token: '<<eventEndTime>>',
  },
  {
    key: 'formLink',
    label: 'Form link',
    description: 'Post-payment registration form URL',
    token: '<<formLink>>',
  },
  {
    key: 'qrCodes',
    label: 'QR codes',
    description: 'Entry QR image(s) — one per ticket',
    token: '<<qrCodes>>',
  },
]

export const DEFAULT_CONFIRMATION_EMAIL_SUBJECT =
  'Payment Successful - Your Ticket Confirmation'

export const DEFAULT_CONFIRMATION_EMAIL_BODY = `<p>Hi <<firstName>>,</p>
<p>Thank you for your purchase! Your payment has been successfully processed.</p>
<p><strong>Event:</strong> <<eventTitle>></p>
<p><strong>Ticket:</strong> <<ticketType>><br/>
<strong>Quantity:</strong> <<quantity>><br/>
<strong>Amount paid:</strong> <<currency>> <<pricePaid>><br/>
<strong>Seat:</strong> <<seatNumber>></p>
<p><strong>When:</strong> <<eventStartDate>> at <<eventStartTime>> – <<eventEndDate>> at <<eventEndTime>><br/>
<strong>Where:</strong> <<eventLocation>></p>
<p>Please arrive 15 minutes early so we can check you in.</p>
<<qrCodes>>
<p>If a registration form is required, use this link: <<formLink>></p>
<p>Questions? Contact us at <a href="mailto:tech@vietvibe.org">tech@vietvibe.org</a>.</p>`

export type ConfirmationEmailValues = Partial<
  Record<ConfirmationEmailPlaceholderKey, string>
>

const PLACEHOLDER_REGEX = /<<\s*([a-zA-Z0-9_]+)\s*>>/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildQrCodesHtml(
  qrCodes: Array<{ label: string; contentBase64: string }>
): string {
  if (!qrCodes.length) {
    return '<p style="font-size:13px;color:#6b7280;">(QR codes will appear here after purchase.)</p>'
  }

  const blocks = qrCodes
    .map(
      (qr) => `
      <div style="text-align:center;margin:0 0 20px 0;">
        <div style="font-size:13px;font-weight:bold;color:#374151;margin-bottom:8px;">${escapeHtml(qr.label)}</div>
        <img src="data:image/png;base64,${qr.contentBase64}" alt="QR code for ${escapeHtml(qr.label)}" width="200" height="200" style="display:block;margin:0 auto;width:200px;height:200px;border:1px solid #e5e7eb;background:#ffffff;" />
      </div>`
    )
    .join('')

  return `
    <div style="margin:24px 0;padding:16px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;">
      <p style="font-size:16px;color:#111827;margin:0 0 8px 0;font-weight:bold;">Your entry QR ${qrCodes.length > 1 ? 'codes' : 'code'}</p>
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px 0;">Show ${qrCodes.length > 1 ? 'each code' : 'this code'} at the door for check-in. One QR per ticket.</p>
      ${blocks}
    </div>`
}

export function renderConfirmationEmailTemplate(
  template: string,
  values: ConfirmationEmailValues
): string {
  return template.replace(PLACEHOLDER_REGEX, (_match, rawKey: string) => {
    const key = rawKey as ConfirmationEmailPlaceholderKey
    const value = values[key]
    if (value === undefined || value === null) return ''
    // qrCodes is trusted HTML we generate; other values are escaped
    if (key === 'qrCodes' || key === 'formLink') {
      return value
    }
    return escapeHtml(value)
  })
}

/** Placeholders whose values are HTML and so cannot appear in a subject. */
const HTML_ONLY_PLACEHOLDERS: ConfirmationEmailPlaceholderKey[] = [
  'qrCodes',
  'formLink',
]

/**
 * Render a subject line as plain text: values are inserted as-is (no HTML
 * escaping), HTML-only placeholders are dropped, and line breaks are removed
 * because email subjects must be a single line.
 */
export function renderConfirmationEmailSubject(
  template: string,
  values: ConfirmationEmailValues
): string {
  return template
    .replace(PLACEHOLDER_REGEX, (_match, rawKey: string) => {
      const key = rawKey as ConfirmationEmailPlaceholderKey
      if (HTML_ONLY_PLACEHOLDERS.includes(key)) return ''
      return values[key] ?? ''
    })
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function wrapConfirmationEmailHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:rgb(236,236,236);">
    <div style="font-family:Arial,sans-serif;padding:20px;background:rgb(236,236,236);">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:20px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tbody>
            <tr>
              <td style="vertical-align:middle;padding-right:8px;">
                <img src="https://www.vietvibe.org/logo/main-logo-1.png" alt="Viet Vibe Foundation Logo" style="width:24px;height:24px;object-fit:contain;display:block;" />
              </td>
              <td style="vertical-align:middle;">
                <span style="font-size:16px;font-weight:bold;color:#767676;">Viet Vibe Foundation</span>
              </td>
            </tr>
          </tbody>
        </table>
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`
}

/** Detect an open `<<partial` token at the cursor for suggestion menus. */
export function getOpenPlaceholderQuery(
  value: string,
  cursor: number
): { query: string; replaceFrom: number; replaceTo: number } | null {
  const before = value.slice(0, cursor)
  const openIdx = before.lastIndexOf('<<')
  if (openIdx === -1) return null

  const afterOpen = before.slice(openIdx + 2)
  if (afterOpen.includes('>>') || /[\s<>]/.test(afterOpen)) return null

  return {
    query: afterOpen,
    replaceFrom: openIdx,
    replaceTo: cursor,
  }
}

export function filterPlaceholders(
  query: string,
  placeholders: ConfirmationEmailPlaceholder[] = CONFIRMATION_EMAIL_PLACEHOLDERS
): ConfirmationEmailPlaceholder[] {
  const q = query.trim().toLowerCase()
  if (!q) return placeholders
  return placeholders.filter(
    (p) =>
      p.key.toLowerCase().includes(q) ||
      p.label.toLowerCase().includes(q) ||
      p.token.toLowerCase().includes(q)
  )
}

export function formatEmailDate(date?: Date | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function buildConfirmationEmailValues(input: {
  firstName: string
  guestName?: string
  ticketType: string
  pricePaid: number
  quantity: number
  currency?: string
  eventTitle?: string
  seatNumber?: string
  eventStartDate?: Date | null
  eventEndDate?: Date | null
  eventLocation?: string | null
  eventStartTime?: string | null
  eventEndTime?: string | null
  formLink?: string | null
  qrCodes?: Array<{ label: string; contentBase64: string }>
}): ConfirmationEmailValues {
  const currency = (input.currency || 'CAD').toUpperCase()
  const formLink = input.formLink?.trim()
  const formLinkHtml = formLink
    ? `<a href="${escapeHtml(formLink)}" style="color:#2563eb;">${escapeHtml(formLink)}</a>`
    : ''

  return {
    firstName: input.firstName,
    guestName: input.guestName || input.firstName,
    ticketType: input.ticketType,
    pricePaid: input.pricePaid.toFixed(2),
    quantity: String(input.quantity),
    currency,
    eventTitle: input.eventTitle || '',
    seatNumber: input.seatNumber || '',
    eventStartDate: formatEmailDate(input.eventStartDate),
    eventEndDate: formatEmailDate(input.eventEndDate),
    eventLocation: input.eventLocation || '',
    eventStartTime: input.eventStartTime || '',
    eventEndTime: input.eventEndTime || '',
    formLink: formLinkHtml,
    qrCodes: buildQrCodesHtml(input.qrCodes || []),
  }
}
