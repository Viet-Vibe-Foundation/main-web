import { describe, expect, test } from 'vitest'
import {
  appendReferralInviteHtml,
  buildConfirmationEmailValues,
  buildQrCodesHtml,
  filterPlaceholders,
  getOpenPlaceholderQuery,
  isHtmlTemplate,
  plainTextTemplateToHtml,
  renderConfirmationEmailBody,
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

  test('appends an invite block when the template omits the referral code', () => {
    const html = appendReferralInviteHtml('<p>Thanks</p>', 'AB12CD34', 'https://www.vietvibe.org/en/events/concert/friday?ref=AB12CD34')
    expect(html).toContain('Invite Your Friends')
    expect(html).toContain('AB12CD34')
    expect(html).toContain('ref=AB12CD34')
    const once = appendReferralInviteHtml(html, 'AB12CD34', 'https://www.vietvibe.org/en/events/concert/friday?ref=AB12CD34')
    expect(once).toBe(html)
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

  test('plain text keeps paragraphs, line breaks, and tab tables', () => {
    const html = plainTextTemplateToHtml(
      'Hi <<firstName>>,\n\nThanks & welcome!\nSee you soon.\n\n🎟 Your Ticket\nEvent\t<<eventTitle>>\nQuantity\t<<quantity>>\n📱 YOUR ENTRY QR CODE\n<<qrCodes>>\nKeep this email.'
    )
    expect(html).toContain('>Hi <<firstName>>,</p>')
    expect(html).toContain('Thanks &amp; welcome!<br/>See you soon.</p>')
    expect(html).toContain('<table')
    expect(html).toContain('>Event</td>')
    expect(html).toContain('><<eventTitle>></td>')
    expect(html).toMatch(/<\/table>\n<p[^>]*>📱 YOUR ENTRY QR CODE<\/p>\n<<qrCodes>>\n<p/)
  })

  test('renderConfirmationEmailBody fills placeholders in plain text', () => {
    const html = renderConfirmationEmailBody('Hi <<firstName>>,\n\nBye', {
      firstName: 'Ada',
    })
    expect(html).toContain('>Hi Ada,</p>')
    expect(html).toContain('>Bye</p>')
    expect(html).toContain('Viet Vibe Foundation')
  })

  test('renderConfirmationEmailBody fills HTML-escaped placeholders', () => {
    const html = renderConfirmationEmailBody(
      '<p>Hi &lt;&lt;firstName&gt;&gt; and &#60;&#60;guestName&#62;&#62;</p>',
      { firstName: 'Ada', guestName: 'Ada L' }
    )
    expect(html).toContain('<p>Hi Ada and Ada L</p>')
    expect(isHtmlTemplate('Hi <<firstName>>')).toBe(false)
    expect(isHtmlTemplate('<p>Hi <<firstName>></p>')).toBe(true)
  })

  test('full HTML documents are not nested and get the referral block inside body', () => {
    const html = renderConfirmationEmailBody(
      '<!DOCTYPE html><html><head><style>p{color:red}</style></head><body><p>Hi <<firstName>></p></body></html>',
      { firstName: 'Ada' },
      { code: 'AB12CD34', link: 'https://x.org/?ref=AB12CD34' }
    )
    expect(html.match(/<html/gi)).toHaveLength(1)
    expect(html).toContain('<style>p{color:red}</style>')
    expect(html.indexOf('AB12CD34')).toBeLessThan(html.indexOf('</body>'))
  })

  test('filterPlaceholders matches key and label', () => {
    expect(filterPlaceholders('qr').map((p) => p.key)).toContain('qrCodes')
    expect(filterPlaceholders('first').map((p) => p.key)).toContain('firstName')
    expect(filterPlaceholders('').length).toBeGreaterThan(5)
  })
})
