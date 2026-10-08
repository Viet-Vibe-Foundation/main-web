import { describe, expect, test } from 'vitest'
import {
  buildConfirmationEmailValues,
  buildQrCodesHtml,
  renderConfirmationEmailTemplate,
} from './confirmationEmailTemplate'

describe('confirmationEmailTemplate', () => {
  test('replaces <<placeholders>> with escaped values', () => {
    const html = renderConfirmationEmailTemplate(
      'Hello <<firstName>>, you bought <<ticketType>> x<<quantity>>',
      {
        firstName: 'Ada <script>',
        ticketType: 'VIP',
        quantity: '2',
      }
    )
    expect(html).toBe('Hello Ada &lt;script&gt;, you bought VIP x2')
  })

  test('leaves unknown placeholders empty', () => {
    expect(renderConfirmationEmailTemplate('Hi <<unknownField>>!', {})).toBe(
      'Hi !'
    )
  })

  test('allows trusted HTML for qrCodes', () => {
    const qrHtml = buildQrCodesHtml([
      { label: 'Ticket #1', contentBase64: 'abc123' },
    ])
    const rendered = renderConfirmationEmailTemplate('Codes: <<qrCodes>>', {
      qrCodes: qrHtml,
    })
    expect(rendered).toContain('data:image/png;base64,abc123')
    expect(rendered).toContain('Ticket #1')
  })

  test('buildConfirmationEmailValues formats money and dates', () => {
    const values = buildConfirmationEmailValues({
      firstName: 'Ada',
      ticketType: 'GA',
      pricePaid: 25.5,
      quantity: 3,
      currency: 'cad',
      eventStartDate: new Date('2026-11-01T12:00:00Z'),
      formLink: 'https://vietvibe.org/form',
    })
    expect(values.pricePaid).toBe('25.50')
    expect(values.currency).toBe('CAD')
    expect(values.quantity).toBe('3')
    expect(values.formLink).toContain('https://vietvibe.org/form')
    expect(values.eventStartDate).toContain('2026')
  })
})
