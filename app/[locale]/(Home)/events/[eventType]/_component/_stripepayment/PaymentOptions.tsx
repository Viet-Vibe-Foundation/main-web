'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import EventSingleCheckOut, { SelectedTicketWithQuantity } from './EventSingleCheckOut'
import EventCartCheckout from './EventCartCheckout'
import EventSeatingMap from './EventSeatingMap'
// import EventQuickCheckout from './EventQuickCheckout'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  SeatingMap,
  SeatValue,
} from '../../../(Admin)/editEvent/[eventKeyName]/_components/EventSeating'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  SEAT_STATUS,
  SEAT_STATUS_USER,
} from '../../../(Admin)/editEvent/[eventKeyName]/_components/EventSeating'
import { EventTicket } from '@prisma/client'
import { JsonValue } from '@prisma/client/runtime/library'
import { getCurrentUserInfo } from '@/lib/actions/user/getCurrentUserInfo'
import { UserInfoProps } from '@/lib/types/userInfo'
import { getTicketUnitPrice } from '@/lib/actions/price/getPrices'

interface PaymentOptionsProps {
  formLink: string
  eventKeyName: string
  eventId: string
  title: string
  userId: string
  type: string
  loggedIn: boolean
  seatingMap?: SeatingMap | null
  tickets?: EventTicket[]
  isCapacityExceeded?: boolean
  discounts: JsonValue
  referralCode?: string | null
  referralDiscountPercent?: number
}

type OptionType = 'checkout' | 'quick' | 'etransfer'

const PaymentOptions: React.FC<PaymentOptionsProps> = ({
  formLink,
  eventKeyName,
  eventId,
  title,
  userId,
  type,
  loggedIn,
  seatingMap,
  tickets = [],
  isCapacityExceeded = false,
  discounts,
  referralCode,
  referralDiscountPercent = 0,
}) => {
  // @ts-ignore: useTranslation will always throw an error for TypeScript
  const { t } = useTranslation('event')
  const [selected, setSelected] = useState<OptionType>('checkout')
  const [showOptions, setShowOptions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevShowOptionsRef = useRef(false)
  const [isSeatSheetOpen, setIsSeatSheetOpen] = useState(false)
  const [selectedSeat, setSelectedSeat] = useState<{
    seat: SeatValue
    rowIndex: number
    seatIndex: number
  } | null>(null)
  // Multi-seat selection: array of selected seats
  const [selectedSeats, setSelectedSeats] = useState<
    Array<{
      seat: SeatValue
      rowIndex: number
      seatIndex: number
    }>
  >([])

  // Selected tickets from EventSingleCheckOut (non-seated tickets with quantities)
  const [selectedTickets, setSelectedTickets] = useState<SelectedTicketWithQuantity[]>([])
  const [userInfo, setUserInfo] = useState<UserInfoProps | null>(null)

  // Fetch user info
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        if (userId) {
          const info = await getCurrentUserInfo()
          setUserInfo(info)
        } else {
          setUserInfo(null)
        }
      } catch (error) {
        console.error('Error fetching user info:', error)
        setUserInfo(null)
      }
    }

    fetchUserInfo()
  }, [userId])

  // Close options when user logs out
  useEffect(() => {
    if (!loggedIn) {
      setShowOptions(false)
    }
  }, [loggedIn])

  const generateSeatName = useCallback((rowIndex: number, colIndex: number) => {
    const rowName = String.fromCharCode(65 + rowIndex) // A, B, C, ...
    const colName = String(colIndex + 1)
    return `${rowName}${colName}`
  }, [])

  const getTicketColor = (ticketId: string, ticketType: string): string => {
    const combined = `${ticketId}-${ticketType}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    const colors = [
      'text-blue-600',
      'text-green-600',
      'text-yellow-600',
      'text-purple-600',
      'text-orange-600',
      'text-pink-600',
      'text-red-600',
      'text-indigo-600',
      'text-amber-600',
      'text-fuchsia-600',
      'text-cyan-600',
      'text-lime-600',
    ]
    const index = Math.abs(hash) % colors.length
    return colors[index]
  }

  const getSeatColor = (seat: SeatValue) => {
    if (seat.status === SEAT_STATUS.OCCUPIED) {
      return 'text-gray-700'
    }
    if (seat.ticketId && seat.ticketType) {
      return getTicketColor(seat.ticketId, seat.ticketType)
    }
    return 'text-gray-400'
  }

  const getSeatTitle = (
    seat: SeatValue,
    rowIndex: number,
    colIndex: number
  ) => {
    const seatName = seat.name || generateSeatName(rowIndex, colIndex)

    if (seat.ticketType) {
      return `${seatName} - ${seat.ticketType}`
    }
    return `${seatName} - Empty seat`
  }

  const getSeatName = useCallback(
    (seat: SeatValue, rowIndex: number, colIndex: number) => {
      if (seat.name) {
        return seat.name
      }
      return generateSeatName(rowIndex, colIndex)
    },
    [generateSeatName]
  )

  const handleSeatClick = useCallback(
    (seat: SeatValue, rowIndex: number, seatIndex: number) => {
      // Always show details sheet (old behavior)
      setSelectedSeat({ seat, rowIndex, seatIndex })
      setIsSeatSheetOpen(true)
    },
    []
  )

  const handleAddToCart = useCallback(
    (seat: SeatValue, rowIndex: number, seatIndex: number) => {
      // Check if seat is already in cart
      const seatKey = `${rowIndex}-${seatIndex}`
      const isSelected = selectedSeats.some(
        (s) => `${s.rowIndex}-${s.seatIndex}` === seatKey
      )

      if (
        !isSelected &&
        seat.ticketId &&
        seat.status !== SEAT_STATUS.OCCUPIED
      ) {
        // Add to cart
        setSelectedSeats((prev) => [...prev, { seat, rowIndex, seatIndex }])
        // Optionally close the sheet after adding
        // setIsSeatSheetOpen(false)
      }
    },
    [selectedSeats]
  )

  const handleRemoveFromCart = useCallback(
    (rowIndex: number, seatIndex: number) => {
      setSelectedSeats((prev) =>
        prev.filter(
          (s) => !(s.rowIndex === rowIndex && s.seatIndex === seatIndex)
        )
      )
    },
    []
  )

  const handleSeatKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      seat: SeatValue,
      rowIndex: number,
      seatIndex: number
    ) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleSeatClick(seat, rowIndex, seatIndex)
      }
    },
    [handleSeatClick]
  )

  const handleSeatSheetOpenChange = (open: boolean) => {
    setIsSeatSheetOpen(open)
    if (!open) {
      setSelectedSeat(null)
    }
  }

  const selectedTicket = useMemo(() => {
    if (!selectedSeat?.seat.ticketId) {
      return null
    }

    return (
      tickets.find((ticket) => ticket.id === selectedSeat.seat.ticketId) ?? null
    )
  }, [selectedSeat?.seat.ticketId, tickets])

  const selectedTicketDisplayPrice = useMemo(
    () => (selectedTicket ? getTicketUnitPrice(selectedTicket) : null),
    [selectedTicket]
  )
  const selectedTicketCurrency = selectedTicket?.currency || 'CAD'

  // Calculate total for all selected seats
  const selectedSeatsWithTickets = useMemo(() => {
    return selectedSeats
      .map((seatData) => {
        const ticket = tickets.find((t) => t.id === seatData.seat.ticketId)
        if (!ticket) return null
        return {
          ...seatData,
          ticket,
          price: getTicketUnitPrice(ticket),
          seatName: getSeatName(
            seatData.seat,
            seatData.rowIndex,
            seatData.seatIndex
          ),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [selectedSeats, tickets, getSeatName])

  const isSeatSelected = useCallback(
    (rowIndex: number, seatIndex: number) => {
      return selectedSeats.some(
        (s) => s.rowIndex === rowIndex && s.seatIndex === seatIndex
      )
    },
    [selectedSeats]
  )

  // Group seats by ticket type for proper checkout
  const seatsByTicketType = useMemo(() => {
    const map = new Map<string, typeof selectedSeatsWithTickets>()
    selectedSeatsWithTickets.forEach((item) => {
      const ticketId = item.ticket.id
      if (!map.has(ticketId)) {
        map.set(ticketId, [])
      }
      map.get(ticketId)!.push(item)
    })
    return map
  }, [selectedSeatsWithTickets])

  const renderSeatDetails = () => {
    if (!selectedSeat) return null

    const { seat, rowIndex, seatIndex } = selectedSeat
    const seatName = getSeatName(seat, rowIndex, seatIndex)
    const hasTicket = Boolean(seat.ticketId)
    const ticket = selectedTicket
    const displayPrice = hasTicket ? selectedTicketDisplayPrice : null
    const priceDisplay = hasTicket
      ? ticket && displayPrice !== null
        ? `${selectedTicketCurrency} $${displayPrice.toFixed(2)}${ticket.payTotalNumber
          ? ` (Full Event: ${ticket.payTotalNumber} sessions)`
          : ''
        }`
        : 'N/A'
      : 'N/A'
    const secondaryDetails = hasTicket
      ? ticket
        ? [
          { label: 'ticket-type', value: seat.ticketType || 'N/A' },
          {
            label: 'price',
            value: priceDisplay,
          },
          ...(ticket.payTotalNumber
            ? [
              {
                label: 'Sessions',
                value: `${ticket.payTotalNumber}`,
              },
            ]
            : []),
        ]
        : [{ label: 'Ticket', value: 'No ticket information available' }]
      : [{ label: 'Ticket', value: 'No ticket assigned' }]

    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Seat</p>
          <p className="text-lg font-semibold text-gray-900">{seatName}</p>
          <p className="text-sm text-gray-600">{`${t('row')} ${rowNames[rowIndex] || String.fromCharCode(65 + rowIndex)}, ${t('seat')} ${columnNames[seatIndex] || String(seatIndex + 1)}`}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {t('status')}
          </p>
          <p className="text-sm font-medium capitalize text-gray-900">
            {SEAT_STATUS_USER[seat.status] || 'Unknown'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {t('details')}
          </p>
          <dl className="space-y-2 text-sm text-gray-700">
            {secondaryDetails.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between"
              >
                <dt className="font-medium text-gray-600">{t(item.label)}</dt>
                <dd className="text-right text-gray-900">{t(item.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    )
  }

  // Extract row and column names from seat names in seatingMap
  const { rowNames, columnNames } = useMemo(() => {
    if (!seatingMap || seatingMap.length === 0) {
      return { rowNames: [], columnNames: [] }
    }

    // Helper function to parse seat name into row and column parts
    const parseSeatName = (
      seatName: string | undefined
    ): { row: string; col: string } | null => {
      if (!seatName) return null

      // Try to match pattern: letters followed by numbers (e.g., "A1", "B12", "AA1")
      const match = seatName.match(/^([A-Za-z]+)(\d+)$/)
      if (match) {
        return { row: match[1].toUpperCase(), col: match[2] }
      }

      // Fallback: try to split at first digit
      const digitIndex = seatName.search(/\d/)
      if (digitIndex > 0) {
        return {
          row: seatName.substring(0, digitIndex).toUpperCase(),
          col: seatName.substring(digitIndex),
        }
      }

      return null
    }

    const extractedRowNames: string[] = []
    const extractedColumnNames: string[] = []

    // Extract row names from the first seat in each row
    for (let rowIndex = 0; rowIndex < seatingMap.length; rowIndex++) {
      const row = seatingMap[rowIndex]
      if (row && row.length > 0) {
        const firstSeat = row[0]
        const parsed = parseSeatName(firstSeat?.name)
        if (parsed) {
          extractedRowNames[rowIndex] = parsed.row
        } else {
          // Fallback to generated name
          extractedRowNames[rowIndex] = String.fromCharCode(65 + rowIndex)
        }
      } else {
        // Fallback to generated name
        extractedRowNames[rowIndex] = String.fromCharCode(65 + rowIndex)
      }
    }

    // Extract column names from the first seat in each column
    if (seatingMap[0]) {
      for (let colIndex = 0; colIndex < seatingMap[0].length; colIndex++) {
        const firstSeat = seatingMap[0][colIndex]
        const parsed = parseSeatName(firstSeat?.name)
        if (parsed) {
          extractedColumnNames[colIndex] = parsed.col
        } else {
          // Fallback to generated name
          extractedColumnNames[colIndex] = String(colIndex + 1)
        }
      }
    }

    return {
      rowNames: extractedRowNames,
      columnNames: extractedColumnNames,
    }
  }, [seatingMap])

  useEffect(() => {
    if (showOptions && !prevShowOptionsRef.current && containerRef.current) {
      // Find the closest scrollable parent
      let element: HTMLElement | null = containerRef.current
      let scrollableParent: HTMLElement | null = null

      while (element && !scrollableParent) {
        const { overflowY } = window.getComputedStyle(element)
        if (overflowY === 'auto' || overflowY === 'scroll') {
          scrollableParent = element
          break
        }
        element = element.parentElement
      }

      // Scroll to bottom after animation
      const timeoutId = setTimeout(() => {
        if (scrollableParent) {
          scrollableParent.scrollTo({
            top: scrollableParent.scrollHeight,
            behavior: 'smooth',
          })
        }
      }, 500) // Wait for animation to complete (400ms animation + 100ms buffer)

      prevShowOptionsRef.current = showOptions
      return () => clearTimeout(timeoutId)
    }
    prevShowOptionsRef.current = showOptions
  }, [showOptions])

  const options: { id: OptionType; label: string }[] = [
    // No quick check out option for Concert
    { id: 'checkout', label: 'normal-checkout' },
    // { id: 'etransfer', label: 'E-transfer' },
  ]

  const seatLegendItems = useMemo(
    () => [
      {
        key: 'available',
        label:
          SEAT_STATUS_USER[SEAT_STATUS.HAS_SEAT] ||
          t('seat-legend-available-label'),
        description: t('seat-legend-available-description'),
        iconClass: 'text-blue-600',
      },
      {
        key: 'reserved',
        label:
          SEAT_STATUS_USER[SEAT_STATUS.OCCUPIED] ||
          t('seat-legend-reserved-label'),
        description: t('seat-legend-reserved-description'),
        iconClass: 'text-gray-700',
      },
      {
        key: 'selected',
        label: 'Selected Seat',
        description: t('seat-legend-selected-description'),
        iconClass: 'text-blue-600',
        wrapperClass: 'bg-gray-200 rounded',
      },
    ],
    [t]
  )

  return (
    <div ref={containerRef} className="w-full text-bgColor-black">
      {isCapacityExceeded ? (
        <div className="mb-4 rounded-md border bg-bgColor-gray300 p-4 text-center">
          <p className="web_h6 text-red-800">
            {t('event-full') ||
              'This event is full. No more tickets available.'}
          </p>
        </div>
      ) : (
        <Button
          variant="default"
          onClick={() => {
            const willOpen = !showOptions
            setShowOptions(willOpen)
            // Scroll is handled in useEffect when showOptions transitions to true
          }}
          className="mb-4 h-[40px] w-full font-semibold md:h-auto"
        >
          <span className="web_h6">{t('reserve-here')}</span>
          <ChevronRight
            className={`ml-2 h-5 w-5 transition-transform duration-300 ${showOptions ? 'rotate-90' : 'rotate-0'}`}
          />
        </Button>
      )}

      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="flex flex-col items-start gap-4 rounded-md bg-gray-50 p-4 shadow-inner dark:bg-gray-900"
          >
            <div className="flex flex-wrap gap-4">
              {options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelected(option.id)}
                  className={`rounded border px-4 py-2 font-medium transition-all ${selected === option.id
                    ? 'bg-primary text-white shadow'
                    : 'border-gray-300 bg-white hover:bg-gray-100'
                    }`}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>

            {/* Choose between normal checkout and seating map */}
            {selected === 'checkout' &&
              (!seatingMap || seatingMap.length === 0) ? (
              <div className="w-full">
                {/* Show normal checkout for Class event */}
                <EventSingleCheckOut
                  formLink={formLink}
                  eventKeyName={eventKeyName}
                  userId={userId}
                  eventId={eventId}
                  tickets={tickets}
                  type={type}
                  selectedTickets={selectedTickets}
                  setSelectedTickets={setSelectedTickets}
                  userInfo={userInfo}
                  discounts={discounts}
                />
              </div>
            ) : seatingMap && seatingMap.length > 0 ? (
              // Show seating map for Concert event
              <EventSeatingMap
                seatingMap={seatingMap}
                columnNames={columnNames}
                rowNames={rowNames}
                selectedSeat={selectedSeat}
                isSeatSelected={isSeatSelected}
                handleSeatClick={handleSeatClick}
                handleSeatKeyDown={handleSeatKeyDown}
                getSeatTitle={getSeatTitle}
                getSeatColor={getSeatColor}
                seatLegendItems={seatLegendItems}
              />
            ) : (
              <div></div>
            )}

            {/* Cart summary */}
            {selected === 'checkout' && !formLink && (
              <>
              {referralCode && (
                <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">
                  {t('referral-checkout-banner')} <strong>{referralCode}</strong>
                  {referralDiscountPercent > 0 && (
                    <>
                      {' '}
                      {t('referral-discount-banner', {
                        percent: referralDiscountPercent,
                      })}
                    </>
                  )}
                </p>
              )}
              <EventCartCheckout
                eventKeyName={eventKeyName}
                userId={userId}
                eventId={eventId}
                type={type}
                selectedSeatsWithTickets={selectedSeatsWithTickets}
                seatsByTicketType={seatsByTicketType}
                onClearCart={() => {
                  setSelectedSeats([])
                  setSelectedTickets([])
                }}
                onRemoveSeat={handleRemoveFromCart}
                selectedTickets={selectedTickets}
                discounts={discounts}
                userInfo={userInfo}
                referralCode={referralCode}
              />
              </>
            )}

            {/* {selected === 'etransfer' && (
              <div className="rounded border bg-white p-4 text-sm leading-relaxed dark:bg-gray-800">
                <p className="mb-2 font-semibold">
                  {t('etransfer-description')}
                </p>
                <ul className="ml-5 list-disc space-y-1">
                  <li>
                    {t('etransfer-description-4')}{' '}
                    <Link
                      href="https://www.facebook.com/people/VIET-VIBE/61570910920072/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-textColor-blue hover:text-textColor-blue"
                    >
                      Facebook
                    </Link>
                    /
                    <Link
                      href="https://www.instagram.com/vietvibe.foundation/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-textColor-blue hover:text-textColor-blue"
                    >
                      Instagram
                    </Link>{' '}
                    {t('etransfer-description-5')}
                  </li>
                  <li>
                    {t('etransfer-description-1')}{' '}
                    <strong>finance@vietvibe.org</strong>
                  </li>
                  <li>
                    {t('etransfer-description-3')}: <strong>{title}</strong>,{' '}
                    {t('etransfer-description-3_5')}
                  </li>
                  <li>
                    {t('etransfer-description-2')}
                  </li>
                </ul> */}
                {/* <p className="pt-2 text-xs italic">
                  *{t('etransfer-description-7')}
                </p> */}
              {/* </div>
            )} */}
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={isSeatSheetOpen} onOpenChange={handleSeatSheetOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-md overflow-y-auto bg-white text-gray-900"
        >
          <SheetHeader>
            <SheetTitle>{t('seat-information')}</SheetTitle>
            <SheetDescription>
              {selectedSeat
                ? `${t('details-for-seat')} ${getSeatName(
                  selectedSeat.seat,
                  selectedSeat.rowIndex,
                  selectedSeat.seatIndex
                )}.`
                : t('select-seat-to-view-details')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            {renderSeatDetails()}
            {selectedSeat?.seat.ticketId && selectedTicket ? (
              <>
                {/* Check if seat is already in cart */}
                {isSeatSelected(
                  selectedSeat.rowIndex,
                  selectedSeat.seatIndex
                ) ? (
                  <div className="flex flex-col gap-3 rounded-md border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-800">
                      {t('seat-added-to-cart')}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleRemoveFromCart(
                          selectedSeat.rowIndex,
                          selectedSeat.seatIndex
                        )
                      }}
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      {t('remove-from-cart')}
                    </Button>
                  </div>
                ) : selectedSeat.seat.status !== SEAT_STATUS.OCCUPIED ? (
                  <Button
                    onClick={() => {
                      handleAddToCart(
                        selectedSeat.seat,
                        selectedSeat.rowIndex,
                        selectedSeat.seatIndex
                      )
                    }}
                    className="w-full"
                  >
                    Add to Cart
                  </Button>
                ) : null}
                {/* Keep the old checkout option for single seat purchase */}
                <div className="mt-4 border-t pt-4">
                  <p className="mb-2 text-sm font-medium text-gray-700">
                    {t('or-purchase-seat-directly')}
                  </p>
                  <EventSingleCheckOut
                    formLink={formLink}
                    eventKeyName={eventKeyName}
                    userId={userId}
                    eventId={eventId}
                    tickets={[selectedTicket]}
                    type={type}
                    seatNumber={selectedSeat?.seat.name}
                    userInfo={userInfo}
                  />
                </div>
              </>
            ) : selectedSeat?.seat.ticketId ? (
              <p className="text-sm text-red-600">
                Unable to load payment configuration for this ticket. Please try
                again later.
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                No ticket assigned to this seat.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export default PaymentOptions
