import { describe, expect, test } from 'vitest'
import {
  buildTicketQrAttachments,
  generateTicketQrPngBase64,
  toResendInlineQrAttachments,
} from './generateTicketQr'

describe('generateTicketQr', () => {
  test('generateTicketQrPngBase64 returns raw base64 png', async () => {
    const base64 = await generateTicketQrPngBase64('vvf_ticket_testtoken123')
    expect(base64.length).toBeGreaterThan(100)
    expect(base64.startsWith('data:')).toBe(false)
    // PNG magic in base64 starts with iVBOR
    expect(base64.startsWith('iVBOR')).toBe(true)
  })

  test('buildTicketQrAttachments labels multiple tickets', async () => {
    const attachments = await buildTicketQrAttachments(
      [
        { id: 'a', qrToken: 'vvf_ticket_aaa', seatLabel: 'B1' },
        { id: 'b', qrToken: 'vvf_ticket_bbb', seatLabel: null },
      ],
      'VIP'
    )

    expect(attachments).toHaveLength(2)
    expect(attachments[0].label).toContain('VIP #1')
    expect(attachments[0].label).toContain('Seat B1')
    expect(attachments[0].contentId).toBe('ticket-qr-a')
    expect(attachments[1].label).toContain('VIP #2')
    expect(attachments[1].contentBase64.startsWith('iVBOR')).toBe(true)

    const resendAttachments = toResendInlineQrAttachments(attachments)
    expect(resendAttachments[0].contentId).toBe('ticket-qr-a')
    expect(resendAttachments[0].content).toBeInstanceOf(Buffer)
  })
})
