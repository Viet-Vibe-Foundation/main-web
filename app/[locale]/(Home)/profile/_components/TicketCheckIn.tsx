'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Html5Qrcode as Html5QrcodeType } from 'html5-qrcode'
import { toast } from 'sonner'
import { Camera, CameraOff, CheckCircle2, Loader2, QrCode } from 'lucide-react'
import {
  getAllPublishedEvents,
  getEventsOfHost,
} from '@/lib/actions/event/getEvent'
import {
  checkInTicketByQr,
  getEventCheckInStats,
  lookupTicketByQr,
  type IssuedTicketLookup,
} from '@/lib/actions/ticket/checkInTicket'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { UserInfoProps } from '@/lib/types/userInfo'

interface TicketCheckInProps {
  user: UserInfoProps
}

const SCANNER_ELEMENT_ID = 'ticket-qr-reader'

export default function TicketCheckIn({ user }: TicketCheckInProps) {
  const [events, setEvents] = useState<Array<{ id: string; title: string }>>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [stats, setStats] = useState<{
    total: number
    checkedIn: number
    remaining: number
  } | null>(null)
  const [manualToken, setManualToken] = useState('')
  const [ticket, setTicket] = useState<IssuedTicketLookup | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'info'>(
    'info'
  )
  const [isScanning, setIsScanning] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const scannerRef = useRef<Html5QrcodeType | null>(null)
  const lastScannedRef = useRef<string>('')
  const lastScanAtRef = useRef<number>(0)

  const isHostOnly =
    user.role.includes('HOST') &&
    !user.role.includes('ADMIN') &&
    !user.role.includes('SUPERADMIN')

  useEffect(() => {
    async function loadEvents() {
      try {
        const data = isHostOnly
          ? await getEventsOfHost(user.id)
          : await getAllPublishedEvents()
        const mapped = (data || []).map(
          (e: { id: string; title: string }) => ({
            id: e.id,
            title: e.title,
          })
        )
        setEvents(mapped)
      } catch (error) {
        console.error(error)
        toast.error('Failed to load events')
      }
    }
    loadEvents()
  }, [isHostOnly, user.id])

  const refreshStats = useCallback(async (eventId: string) => {
    if (!eventId) {
      setStats(null)
      return
    }
    const next = await getEventCheckInStats(eventId)
    setStats(next)
  }, [])

  useEffect(() => {
    if (selectedEventId) {
      void refreshStats(selectedEventId)
    } else {
      setStats(null)
    }
  }, [selectedEventId, refreshStats])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    if (!scanner) {
      setIsScanning(false)
      return
    }
    try {
      const { Html5QrcodeScannerState } = await import('html5-qrcode')
      const state = scanner.getState()
      if (
        state === Html5QrcodeScannerState.SCANNING ||
        state === Html5QrcodeScannerState.PAUSED
      ) {
        await scanner.stop()
      }
      await scanner.clear()
    } catch (error) {
      console.error('Error stopping scanner', error)
    } finally {
      scannerRef.current = null
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      void stopScanner()
    }
  }, [stopScanner])

  const handleDecoded = useCallback(
    async (decodedText: string) => {
      const now = Date.now()
      if (
        decodedText === lastScannedRef.current &&
        now - lastScanAtRef.current < 4000
      ) {
        return
      }
      lastScannedRef.current = decodedText
      lastScanAtRef.current = now

      setIsBusy(true)
      setStatusMessage(null)
      try {
        const result = await checkInTicketByQr(decodedText)
        if (result.ticket) {
          setTicket(result.ticket)
          if (
            selectedEventId &&
            result.ticket.eventId !== selectedEventId
          ) {
            setSelectedEventId(result.ticket.eventId)
          }
        }
        if (result.success) {
          setStatusTone('success')
          setStatusMessage(result.message || 'Checked in')
          toast.success(result.message || 'Checked in')
          if (result.ticket?.eventId) {
            await refreshStats(result.ticket.eventId)
          }
        } else {
          setStatusTone('error')
          setStatusMessage(result.error || 'Check-in failed')
          toast.error(result.error || 'Check-in failed')
        }
      } catch (error) {
        console.error(error)
        setStatusTone('error')
        setStatusMessage('Check-in failed')
        toast.error('Check-in failed')
      } finally {
        setIsBusy(false)
      }
    },
    [refreshStats, selectedEventId]
  )

  const startScanner = async () => {
    if (isScanning) return
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          void handleDecoded(decodedText)
        },
        () => {
          // ignore frame-level no-match errors
        }
      )
      setIsScanning(true)
    } catch (error) {
      console.error(error)
      toast.error('Unable to access camera. You can enter the code manually.')
      await stopScanner()
    }
  }

  const handleManualLookup = async () => {
    if (!manualToken.trim()) {
      toast.error('Enter a QR token first')
      return
    }
    setIsBusy(true)
    setStatusMessage(null)
    try {
      const result = await lookupTicketByQr(manualToken.trim())
      if (!result.success || !result.ticket) {
        setTicket(null)
        setStatusTone('error')
        setStatusMessage(result.error || 'Ticket not found')
        toast.error(result.error || 'Ticket not found')
        return
      }
      setTicket(result.ticket)
      setSelectedEventId(result.ticket.eventId)
      setStatusTone('info')
      setStatusMessage(
        result.ticket.checkedInAt
          ? 'Ticket already checked in'
          : 'Ticket found — ready to check in'
      )
    } finally {
      setIsBusy(false)
    }
  }

  const handleManualCheckIn = async () => {
    const payload = manualToken.trim() || ticket?.qrToken
    if (!payload) {
      toast.error('Scan a QR code or enter a token first')
      return
    }
    await handleDecoded(payload)
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-2 md:p-4">
      <div>
        <h1 className="text-textColor-black text-2xl font-semibold">
          Ticket Check-In
        </h1>
        <p className="text-textColor-gray mt-1 text-sm">
          Scan a guest QR code to mark that ticket as checked in. Each purchased
          ticket has its own QR code.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Filter by event (optional)</label>
        <Select
          value={selectedEventId || 'all'}
          onValueChange={(value) =>
            setSelectedEventId(value === 'all' ? '' : value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {stats && (
          <p className="text-sm text-muted-foreground">
            Checked in {stats.checkedIn} / {stats.total} · Remaining{' '}
            {stats.remaining}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-bgColor-white">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="h-4 w-4" />
            Camera scanner
          </div>
          <div className="flex gap-2">
            {!isScanning ? (
              <Button type="button" size="sm" onClick={() => void startScanner()}>
                <Camera className="mr-2 h-4 w-4" />
                Start camera
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void stopScanner()}
              >
                <CameraOff className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
          </div>
        </div>
        <div className="bg-black/90 p-3">
          <div id={SCANNER_ELEMENT_ID} className="mx-auto w-full max-w-md" />
          {!isScanning && (
            <p className="py-10 text-center text-sm text-white/70">
              Start the camera to scan ticket QR codes
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Or enter QR token manually</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="vvf_ticket_…"
          />
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={() => void handleManualLookup()}
          >
            Look up
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => void handleManualCheckIn()}
          >
            {isBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Check in
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            statusTone === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : statusTone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-blue-200 bg-blue-50 text-blue-800'
          }`}
        >
          {statusMessage}
        </div>
      )}

      {ticket && (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <h2 className="text-lg font-semibold">{ticket.eventTitle}</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Ticket type</dt>
              <dd className="font-medium">{ticket.ticketType || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seat</dt>
              <dd className="font-medium">{ticket.seatLabel || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Guest</dt>
              <dd className="font-medium">{ticket.guestName || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{ticket.guestEmail || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">
                {ticket.refunded
                  ? 'Refunded'
                  : ticket.checkedInAt
                    ? `Checked in ${new Date(ticket.checkedInAt).toLocaleString()}`
                    : 'Not checked in'}
              </dd>
            </div>
            {ticket.checkedInByName && (
              <div>
                <dt className="text-muted-foreground">Checked in by</dt>
                <dd className="font-medium">{ticket.checkedInByName}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}
