import { describe, expect, test } from 'vitest'
import {
  buildConfirmationEmailValues,
  buildQrCodesHtml,
  filterPlaceholders,
  getOpenPlaceholderQuery,
  renderConfirmationEmailSubject,
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
      { contentId: 'ticket-qr-1', label: 'Ticket #1' },
    ])
    const rendered = renderConfirmationEmailTemplate('Codes: <<qrCodes>>', {
      qrCodes: qrHtml,
    })
    expect(rendered).toContain('src="cid:ticket-qr-1"')
    expect(rendered).toContain('Ticket #1')
  })

  test('subject renders plain text without HTML escaping or HTML-only fields', () => {
    const subject = renderConfirmationEmailSubject(
      'Tickets for <<eventTitle>> <<qrCodes>><<formLink>>\n<<firstName>>',
      {
        eventTitle: 'Rock & Roll',
        firstName: 'Ada',
        qrCodes: '<div>data:image/png;base64,abc</div>',
        formLink: '<a href="https://x">x</a>',
      }
    )
    expect(subject).toBe('Tickets for Rock & Roll Ada')
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

  test('getOpenPlaceholderQuery detects unfinished <<token at cursor', () => {
    const value = 'Hello <<fir'
    expect(getOpenPlaceholderQuery(value, value.length)).toEqual({
      query: 'fir',
      replaceFrom: 6,
      replaceTo: value.length,
    })
    expect(getOpenPlaceholderQuery('Hello <<firstName>>!', 19)).toBeNull()
    expect(getOpenPlaceholderQuery('No token here', 5)).toBeNull()
  })

  test('filterPlaceholders matches key and label', () => {
    expect(filterPlaceholders('qr').map((p) => p.key)).toContain('qrCodes')
    expect(filterPlaceholders('first').map((p) => p.key)).toContain('firstName')
    expect(filterPlaceholders('').length).toBeGreaterThan(5)
  })
})
