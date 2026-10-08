// Libraries
import React from 'react'
import { Resend } from 'resend'
import type { TicketQrAttachment } from '@/lib/actions/ticket/generateTicketQr'

// Interfaces and Types
interface EmailTemplatePaymentConfirmationProps {
  firstName: string
  ticketType: string
  pricePaid: number
  quantity: number
  currency?: string
  ticketImageUrl?: string | null
  perSessionPrice?: number
  payTotalNumber?: number | null
  eventTitle?: string
  seatNumber?: string
  eventStartDate?: Date | null
  eventEndDate?: Date | null
  eventLocation?: string | null
  eventStartTime?: string | null
  eventEndTime?: string | null
  formLink?: string | null
  qrCodes?: Array<{ contentId: string; label: string; contentBase64: string }>
}

interface SendPaymentConfirmationEmailProps {
  firstName: string
  to: string
  ticketType: string
  pricePaid: number
  quantity: number
  currency?: string
  ticketImageUrl?: string | null
  perSessionPrice?: number
  payTotalNumber?: number | null
  eventTitle?: string
  seatNumber?: string
  eventStartDate?: Date | null
  eventEndDate?: Date | null
  eventLocation?: string | null
  eventStartTime?: string | null
  eventEndTime?: string | null
  formLink?: string | null
  qrAttachments?: TicketQrAttachment[]
}

// Email Template Component
const EmailTemplatePaymentConfirmation = ({
  firstName,
  ticketType,
  pricePaid,
  quantity,
  currency = 'CAD',
  ticketImageUrl,
  perSessionPrice,
  payTotalNumber,
  eventTitle,
  seatNumber,
  eventStartDate,
  eventEndDate,
  eventLocation,
  eventStartTime,
  eventEndTime,
  formLink,
  qrCodes = [],
}: EmailTemplatePaymentConfirmationProps) => {
  const currencyLabel = currency.toUpperCase()
  const formattedPrice = pricePaid.toFixed(2)
  const formattedPerSessionPrice = perSessionPrice?.toFixed(2) || '0.00'

  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        padding: '20px',
        backgroundColor: 'rgb(236,236,236)',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '20px',
        }}
      >
        {/* Logo Header */}
        <table cellPadding={0} cellSpacing={0} style={{ marginBottom: '24px' }}>
          <tbody>
            <tr>
              <td style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.vietvibe.org/logo/main-logo-1.png"
                  alt="Viet Vibe Foundation Logo"
                  style={{
                    width: '24px',
                    height: '24px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </td>
              <td style={{ verticalAlign: 'middle' }}>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#767676',
                  }}
                >
                  Viet Vibe Foundation
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <h1
          style={{ fontSize: '24px', marginBottom: '20px', color: '#111827' }}
        >
          Payment Successful, {firstName}!
        </h1>
        <p style={{ fontSize: '16px', color: '#374151', marginBottom: '20px' }}>
          Thank you for your purchase! Your payment has been successfully
          processed.
        </p>

        {eventTitle && (
          <p
            style={{
              fontSize: '16px',
              color: '#374151',
              marginBottom: '20px',
              fontWeight: 'bold',
            }}
          >
            Event: {eventTitle}
          </p>
        )}

        {/* Ticket Card */}
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            borderRadius: 6,
            border: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            marginBottom: '20px',
          }}
        >
          <tbody>
            <tr>
              {/* Left: text content */}
              <td
                style={{
                  padding: '16px',
                  verticalAlign: 'top',
                }}
              >
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#111827',
                    marginBottom: '8px',
                  }}
                >
                  {ticketType}
                </div>

                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#111827',
                    marginBottom: '12px',
                  }}
                >
                  {currencyLabel} {formattedPrice}
                </div>

                {seatNumber ? (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                    }}
                  >
                    Seat Number: {seatNumber}
                  </div>
                ) : payTotalNumber && payTotalNumber > 0 ? (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                    }}
                  >
                    Total for {payTotalNumber} sessions – {currencyLabel}{' '}
                    {formattedPerSessionPrice} each
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '8px',
                    }}
                  >
                    {currencyLabel} {formattedPerSessionPrice} per session
                  </div>
                )}

                {quantity > 1 && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                    }}
                  >
                    Quantity: {quantity}
                  </div>
                )}
                {eventStartDate &&
                  eventEndDate &&
                  eventStartTime &&
                  eventEndTime &&
                  (() => {
                    const startDate = new Date(eventStartDate)
                    const endDate = new Date(eventEndDate)
                    const startDateStr = startDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                    const endDateStr = endDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })

                    return (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#111827',
                          marginBottom: '8px',
                        }}
                      >
                        Event Time: {startDateStr} at {eventStartTime} - {endDateStr} at{' '}
                        {eventEndTime}
                      </div>
                    )
                  })()}
                {eventLocation && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#111827',
                      marginBottom: '8px',
                    }}
                  >
                    Event Location: {eventLocation}
                  </div>
                )}
                {/* Acoustic Camp participant document link */}
                {eventTitle?.toLowerCase().includes('acoustic camp') && (
                  <p style={{ fontSize: '12px', color: '#111827', marginTop: '8px' }}>
                    Please check out this document for more information about the event:{' '}
                    <a
                      href="https://docs.google.com/document/d/197emItEXbcai1FbjJklf2FbrLFLu_OEdkCMvrQjYKh4/edit?usp=sharing"
                      style={{ color: '#2563eb' }}
                    >
                      Acoustic Camp all information (Google Doc)
                    </a>
                    .
                  </p>
                )}
                <p
                  style={{
                    fontSize: '11px',
                    color: '#111827',
                    marginBottom: '8px',
                    fontStyle: 'italic',
                  }}
                >
                  {' '}
                  Please arrive 15 minutes before the event starts so we can
                  check you in, thank you and see you soon!
                </p>
                <p
                  style={{
                    fontSize: '9px',
                    color: '#111827',
                    marginBottom: '8px',
                  }}
                >
                  {' '}
                  *Note: There will be an email from Stripe with an invoice and
                  receipt attached for your payment. Please check your spam
                  folder if you don't see it in your inbox.
                </p>
              </td>

              {/* Right: image column */}
              {ticketImageUrl && (
                <td
                  width="40%"
                  style={{
                    backgroundColor: '#f3f4f6',
                    textAlign: 'right',
                    verticalAlign: 'middle',
                    padding: 0,
                  }}
                >
                  <a
                    href="https://www.vietvibe.org/en/events"
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      textDecoration: 'none',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ticketImageUrl}
                      alt={`${ticketType} ticket`}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </a>
                </td>
              )}
            </tr>
          </tbody>
        </table>

        {qrCodes.length > 0 && (
          <div
            style={{
              marginTop: '24px',
              marginBottom: '20px',
              padding: '16px',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb',
            }}
          >
            <p
              style={{
                fontSize: '16px',
                color: '#111827',
                margin: '0 0 8px 0',
                fontWeight: 'bold',
              }}
            >
              Your entry QR {qrCodes.length > 1 ? 'codes' : 'code'}
            </p>
            <p
              style={{
                fontSize: '13px',
                color: '#6b7280',
                margin: '0 0 16px 0',
              }}
            >
              Show {qrCodes.length > 1 ? 'each code' : 'this code'} at the door for
              check-in. You received {qrCodes.length} ticket
              {qrCodes.length > 1 ? 's' : ''} — one QR per ticket.
            </p>
            <table cellPadding={0} cellSpacing={0} width="100%">
              <tbody>
                {qrCodes.map((qr) => (
                  <tr key={qr.contentId}>
                    <td
                      style={{
                        textAlign: 'center',
                        paddingBottom: '20px',
                        verticalAlign: 'top',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 'bold',
                          color: '#374151',
                          marginBottom: '8px',
                        }}
                      >
                        {qr.label}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/png;base64,${qr.contentBase64}`}
                        alt={`QR code for ${qr.label}`}
                        width={200}
                        height={200}
                        style={{
                          display: 'block',
                          margin: '0 auto',
                          width: '200px',
                          height: '200px',
                          border: '1px solid #e5e7eb',
                          backgroundColor: '#ffffff',
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {formLink && (
          <div
            style={{
              marginTop: '20px',
              marginBottom: '20px',
              padding: '16px',
              borderRadius: '6px',
              border: '1px solid #dbeafe',
              backgroundColor: '#eff6ff',
            }}
          >
            <p
              style={{
                fontSize: '15px',
                color: '#1e40af',
                margin: '0 0 12px 0',
                fontWeight: 'bold',
              }}
            >
              Complete your registration form
            </p>
            <p style={{ fontSize: '14px', color: '#374151', margin: '0 0 12px 0' }}>
              Please fill out the event registration form using the link below so we
              can prepare for your arrival.
            </p>
            <a
              href={formLink}
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              Fill registration form
            </a>
          </div>
        )}

        <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '20px' }}>
          If you have any questions, please contact us at{' '}
          <a href="mailto:tech@vietvibe.org" style={{ color: '#2563eb' }}>
            tech@vietvibe.org
          </a>
          .
        </p>
      </div>
    </div>
  )
}

export async function sendPaymentConfirmationEmail({
  firstName,
  to,
  ticketType,
  pricePaid,
  quantity,
  currency,
  ticketImageUrl,
  perSessionPrice,
  payTotalNumber,
  eventTitle,
  seatNumber,
  eventStartDate,
  eventEndDate,
  eventLocation,
  eventStartTime,
  eventEndTime,
  formLink,
  qrAttachments = [],
}: SendPaymentConfirmationEmailProps) {
  const resend = new Resend(process.env.RESEND_API_KEY_PRODUCTION)

  try {
    const result = await resend.emails.send({
      from: 'VVF Admin <admin.tech@vietvibe.org>',
      to: to,
      subject: 'Payment Successful - Your Ticket Confirmation',
      react: EmailTemplatePaymentConfirmation({
        firstName,
        ticketType,
        pricePaid,
        quantity,
        currency,
        ticketImageUrl,
        perSessionPrice,
        payTotalNumber,
        eventTitle,
        seatNumber,
        eventStartDate,
        eventEndDate,
        eventLocation,
        eventStartTime,
        eventEndTime,
        formLink,
        qrCodes: qrAttachments.map(({ contentId, label, contentBase64 }) => ({
          contentId,
          label,
          contentBase64,
        })),
      }),
      // PNG attachments as a fallback for clients that strip inline data URIs
      attachments: qrAttachments.map((qr) => ({
        filename: qr.filename,
        content: Buffer.from(qr.contentBase64, 'base64'),
        contentType: 'image/png',
      })),
    })
    console.log('result sendPaymentConfirmationEmail', result)
    if (result.error) {
      console.error('[PAYMENT_CONFIRMATION_EMAIL_ERROR]', result.error)
      throw result.error
    }

    return result
  } catch (error) {
    console.error('[PAYMENT_CONFIRMATION_EMAIL_ERROR]', error)
    throw error
  }
}
