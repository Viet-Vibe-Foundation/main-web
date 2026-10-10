import 'server-only'

import QRCode from 'qrcode'

export type TicketQrAttachment = {
  /** Content-ID used as cid: in the email HTML */
  contentId: string
  filename: string
  /** Base64-encoded PNG (no data: prefix) */
  contentBase64: string
  label: string
  qrToken: string
}

export async function generateTicketQrPngBase64(qrToken: string): Promise<string> {
  // Encode the token itself so staff scanners can check in without opening a URL
  const dataUrl = await QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    type: 'image/png',
  })
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  return base64
}

export async function buildTicketQrAttachments(
  tickets: Array<{ id: string; qrToken: string; seatLabel?: string | null }>,
  ticketTypeLabel?: string
): Promise<TicketQrAttachment[]> {
  const attachments: TicketQrAttachment[] = []

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]
    const contentBase64 = await generateTicketQrPngBase64(ticket.qrToken)
    const seatPart = ticket.seatLabel ? ` Seat ${ticket.seatLabel}` : ''
    const label =
      tickets.length > 1
        ? `${ticketTypeLabel || 'Ticket'} #${i + 1}${seatPart}`
        : `${ticketTypeLabel || 'Ticket'}${seatPart}`

    attachments.push({
      contentId: `ticket-qr-${ticket.id}`,
      filename: `ticket-qr-${i + 1}.png`,
      contentBase64,
      label,
      qrToken: ticket.qrToken,
    })
  }

  return attachments
}

/**
 * Resend inline PNG attachments. HTML must use src="cid:{contentId}".
 * Uses snake_case fields — resend@4.x forwards attachments to the API as-is
 * (no camelCase mapping), so content_id is required for CID embedding.
 */
export function toResendInlineQrAttachments(attachments: TicketQrAttachment[]) {
  return attachments.map((qr) => ({
    filename: qr.filename,
    content: qr.contentBase64,
    content_type: 'image/png',
    content_id: qr.contentId,
  }))
}
