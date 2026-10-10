'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadStripe } from '@stripe/stripe-js'
import { toast } from 'sonner'
import { axiosInstance } from '@/lib/axios'
import { isAxiosError } from 'axios'
import { checkSubscription } from '@/lib/actions/payment/checkSubscription'
import { verifyEventDiscountCode } from '@/lib/actions/event/verifyEventDiscountCode'
import { getEventForm, EventFormData } from '@/lib/actions/event/getEventForm'
import Loader from '@/components/loader/Loader'
import { Button } from '@/components/ui/button'
import { ArrowRight, Loader2 } from 'lucide-react'
import { EventTicket } from '@prisma/client'
import { GuestInfo } from '@/components/payment/GuestInfoForm'
import { FormResponses } from '@/components/payment/PaymentInfoForm'
import { EventCheckoutDialog } from '@/components/payment/EventCheckoutDialog'
import { SelectedTicketWithQuantity } from './EventSingleCheckOut'
import { JsonValue } from '@prisma/client/runtime/library'
import { UserInfoProps } from '@/lib/types/userInfo'
import { CheckoutItems } from '@/lib/types/payment'
import { useSession } from 'next-auth/react'
import {
  getCombinedMemberStudentPercentOff,
  getFinalTicketPrice,
  getMemberDiscountPercent,
  getTicketUnitPrice,
  STUDENT_DISCOUNT_PERCENT,
} from '@/lib/actions/price/getPrices'

interface SelectedSeatWithTicket {
  seat: {
    ticketId: string | null
    ticketType: string | null
    status: number // SEAT_STATUS enum value
    name?: string
  }
  rowIndex: number
  seatIndex: number
  ticket: EventTicket
  price: number
  seatName: string
}

interface EventCartCheckoutProps {
  eventKeyName: string
  userId?: string | null
  eventId: string
  type: string
  selectedSeatsWithTickets: SelectedSeatWithTicket[]
  seatsByTicketType: Map<string, SelectedSeatWithTicket[]>
  onClearCart: () => void
  onRemoveSeat: (rowIndex: number, seatIndex: number) => void
  selectedTickets?: SelectedTicketWithQuantity[] // Tickets selected from EventSingleCheckOut
  discounts: JsonValue
  userInfo?: UserInfoProps | null
}

// Shape of discounts stored in event.eventDiscounts JSON field
interface EventDiscountJson {
  id?: string
  type?: string
  discountAmount?: number
  discountUnit?: 'percentage' | 'amount'
  minQuantity?: number | null
  minTotal?: number | null
  code?: string | null
  cannotBeStacked?: boolean | null
}

type AppliedCodeDiscount = {
  code: string
  discountAmount: number
  discountUnit: 'percentage' | 'amount'
  cannotBeStacked: boolean
}

export default function EventCartCheckout({
  eventKeyName,
  userId,
  eventId,
  type,
  selectedSeatsWithTickets,
  seatsByTicketType,
  onClearCart,
  onRemoveSeat,
  selectedTickets = [],
  discounts = [],
  userInfo,
}: EventCartCheckoutProps) {
  // @ts-ignore: useTranslation will always throw an error for TypeScript
  const { t } = useTranslation('event')
  const { data: session } = useSession()

  // Check subscription status for member pricing
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isDiscountsExpanded, setIsDiscountsExpanded] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [appliedCodeDiscount, setAppliedCodeDiscount] =
    useState<AppliedCodeDiscount | null>(null)
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0)

  // Event form data and responses
  const [eventFormData, setEventFormData] = useState<EventFormData>(null)
  const [isLoadingEventForm, setIsLoadingEventForm] = useState(true)
  const [guestInfo, setGuestInfo] = useState<{ representativeGuest?: GuestInfo; otherGuests?: GuestInfo[] }>({})

  const isGuestCheckout = !userId || userId.trim() === ''
  const eduEmailExpiredDate = session?.user?.eduEmailExpiredDate
    ? new Date(session.user.eduEmailExpiredDate)
    : null
  const hasActiveStudentDiscount =
    !!eduEmailExpiredDate &&
    !Number.isNaN(eduEmailExpiredDate.getTime()) &&
    eduEmailExpiredDate > new Date()

  // Sum of the number of selected seats and tickets
  const totalItemCount =
    selectedSeatsWithTickets.length +
    selectedTickets.reduce(
      (sum, item) => sum + item.quantity * (item.ticket.capacityPerTicket ?? 1),
      0
    )

  // Normalize discounts JSON into a typed array for easier rendering
  const discountList: EventDiscountJson[] = useMemo(() => {
    if (Array.isArray(discounts)) {
      return discounts as EventDiscountJson[]
    }
    return []
  }, [discounts])

  const handleVerifyDiscountCode = useCallback(
    async (code: string) => {
      setIsVerifyingCode(true)
      try {
        const result = await verifyEventDiscountCode({
          eventId,
          code,
        })

        if (result.valid) {
          setAppliedCodeDiscount({
            code: result.code!,
            discountAmount: result.discountAmount!,
            discountUnit: result.discountUnit!,
            cannotBeStacked: Boolean(result.cannotBeStacked),
          })
          toast.success('Discount code applied', {
            description:
              result.discountUnit === 'amount'
                ? `Applied $${result.discountAmount.toFixed(2)} off`
                : `Applied ${result.discountAmount}% off`,
            style: { color: '#22c55e' },
          })
        } else {
          setAppliedCodeDiscount(null)
          const limitReached = result.reason === 'Code usage limit reached'
          toast.error(limitReached ? 'Discount code limit reached' : 'Invalid discount code', {
            description: limitReached
              ? 'This code has already been used the maximum number of times.'
              : result.reason || 'The discount code is not valid. Please try again.',
            style: { color: '#ef4444' },
          })
        }
      } catch (error) {
        setAppliedCodeDiscount(null)
        toast.error('Something went wrong', {
          description: error instanceof Error
            ? error.message
            : 'Unable to verify discount code. Please try again.',
          style: { color: '#ef4444' },
        })
      } finally {
        setIsVerifyingCode(false)
        // Set cooldown: 30 seconds from now
        setCooldownEndTime(Date.now() + 30000)
      }
    },
    [eventId]
  )

  const handleRemoveCodeDiscount = useCallback(() => {
    setAppliedCodeDiscount(null)
    setDiscountCode('')
    toast.info('Discount code removed', {
      description: 'The discount code has been removed.',
      style: { color: '#3b82f6' },
    })
  }, [])

  useEffect(() => {
    let isMounted = true
    const fetchSubscription = async () => {
      try {
        if (userId) {
          const subscribed = await checkSubscription(userId)
          if (isMounted) {
            setIsSubscribed(Boolean(subscribed))
          }
        }
      } catch (error) {
        console.error('Error checking subscription:', error)
      } finally {
        if (isMounted) {
          setIsLoadingSubscription(false)
        }
      }
    }
    fetchSubscription()
    return () => {
      isMounted = false
    }
  }, [userId])

  // Fetch event form data
  useEffect(() => {
    let isMounted = true
    const fetchEventForm = async () => {
      try {
        const formData = await getEventForm(eventId)
        if (isMounted) {
          setEventFormData(formData)
        }
      } catch (error) {
        console.error('Error fetching event form:', error)
      } finally {
        if (isMounted) {
          setIsLoadingEventForm(false)
        }
      }
    }
    fetchEventForm()
    return () => {
      isMounted = false
    }
  }, [eventId])

  // Cooldown timer for discount code verification
  useEffect(() => {
    if (!cooldownEndTime) {
      setCooldownRemaining(0)
      return
    }

    const updateCooldown = () => {
      const now = Date.now()
      const remaining = Math.max(0, Math.ceil((cooldownEndTime - now) / 1000))
      setCooldownRemaining(remaining)

      if (remaining === 0) {
        setCooldownEndTime(null)
      }
    }

    // Update immediately
    updateCooldown()

    // Update every second
    const interval = setInterval(updateCooldown, 1000)

    return () => clearInterval(interval)
  }, [cooldownEndTime])

  // Calculate total price with all discounts applied
  const priceBreakdown = useMemo(() => {
    // Calculate base total (sum of all seat prices)
    const seatsTotal = selectedSeatsWithTickets.reduce(
      (sum, item) => sum + item.price,
      0
    )

    // Calculate total for selected tickets (non-seated)
    const ticketsTotal = selectedTickets.reduce((sum, item) => {
      return sum + getFinalTicketPrice(item.ticket, { quantity: item.quantity })
    }, 0)

    const baseTotal = seatsTotal + ticketsTotal

    // Apply membership discounts if subscribed
    let totalAfterMembership = baseTotal
    let membershipDiscountAmount = 0

    if (isSubscribed) {
      // Discount for seats
      selectedSeatsWithTickets.forEach((item) => {
        const discountPercent = getMemberDiscountPercent(item.ticket)
        if (discountPercent > 0) {
          const discountAmount = item.price * (discountPercent / 100)
          membershipDiscountAmount += discountAmount
          totalAfterMembership -= discountAmount
        }
      })

      // Discount for tickets
      selectedTickets.forEach((item) => {
        const discountPercent = getMemberDiscountPercent(item.ticket)
        if (discountPercent > 0) {
          const totalTicketPrice = getFinalTicketPrice(item.ticket, {
            quantity: item.quantity,
          })
          const discountAmount = totalTicketPrice * (discountPercent / 100)
          membershipDiscountAmount += discountAmount
          totalAfterMembership -= discountAmount
        }
      })
    }

    // Student % off list price (additive with member %; same as getFinalTicketPrice)
    let totalAfterStudent = totalAfterMembership
    let studentDiscountAmount = 0
    if (hasActiveStudentDiscount) {
      selectedSeatsWithTickets.forEach((item) => {
        const d = item.price * (STUDENT_DISCOUNT_PERCENT / 100)
        studentDiscountAmount += d
        totalAfterStudent -= d
      })
      selectedTickets.forEach((item) => {
        const lineBase =
          getTicketUnitPrice(item.ticket) * Math.max(0, item.quantity)
        const d = lineBase * (STUDENT_DISCOUNT_PERCENT / 100)
        studentDiscountAmount += d
        totalAfterStudent -= d
      })
    }

    // Apply event discounts with stacking rules
    let totalAfterBulk = totalAfterStudent
    let bulkDiscountAmount = 0
    let effectivePercent = 0
    let effectiveAmount = 0

    if (discountList.length > 0 || appliedCodeDiscount) {
      // First, for each non‑code discount type, pick the single "best" qualifying discount
      // separately for percentage‑based and amount‑based discounts:
      // - Bulk Discount: highest minQuantity (stricter condition)
      // - Minimum Total Discount: highest minTotal
      let bestBulkPercent: EventDiscountJson | null = null
      let bestMinTotalPercent: EventDiscountJson | null = null
      let bestBulkAmount: EventDiscountJson | null = null
      let bestMinTotalAmount: EventDiscountJson | null = null

      discountList.forEach((discount) => {
        const value = discount.discountAmount ?? 0
        if (value <= 0) return

        const unit = discount.discountUnit ?? 'percentage'

        if (discount.type === 'Bulk Discount') {
          const minQty = discount.minQuantity ?? 0
          const qualifies = totalItemCount >= minQty
          if (!qualifies) return

          if (unit === 'amount') {
            if (!bestBulkAmount || (bestBulkAmount.minQuantity ?? 0) < minQty) {
              bestBulkAmount = discount
            }
          } else {
            if (!bestBulkPercent || (bestBulkPercent.minQuantity ?? 0) < minQty) {
              bestBulkPercent = discount
            }
          }
        } else if (discount.type === 'Minimum Total Discount') {
          const minTotal = discount.minTotal ?? 0
          const qualifies = totalAfterStudent >= minTotal
          if (!qualifies) return

          if (unit === 'amount') {
            if (!bestMinTotalAmount || (bestMinTotalAmount.minTotal ?? 0) < minTotal) {
              bestMinTotalAmount = discount
            }
          } else {
            if (!bestMinTotalPercent || (bestMinTotalPercent.minTotal ?? 0) < minTotal) {
              bestMinTotalPercent = discount
            }
          }
        }
      })

      // If both percentage and amount discounts exist for the same type,
      // only keep the one with the highest requirement (minQuantity for Bulk, minTotal for Minimum Total)
      if (bestBulkPercent && bestBulkAmount) {
        const bulkPercent = bestBulkPercent as EventDiscountJson
        const bulkAmount = bestBulkAmount as EventDiscountJson
        const percentMinQty = bulkPercent.minQuantity ?? 0
        const amountMinQty = bulkAmount.minQuantity ?? 0
        if (amountMinQty > percentMinQty) {
          bestBulkPercent = null
        } else if (percentMinQty > amountMinQty) {
          bestBulkAmount = null
        } else {
          // If equal, prefer percentage (arbitrary choice)
          bestBulkAmount = null
        }
      }

      if (bestMinTotalPercent && bestMinTotalAmount) {
        const minTotalPercent = bestMinTotalPercent as EventDiscountJson
        const minTotalAmount = bestMinTotalAmount as EventDiscountJson
        const percentMinTotal = minTotalPercent.minTotal ?? 0
        const amountMinTotal = minTotalAmount.minTotal ?? 0
        if (amountMinTotal > percentMinTotal) {
          bestMinTotalPercent = null
        } else if (percentMinTotal > amountMinTotal) {
          bestMinTotalAmount = null
        } else {
          // If equal, prefer percentage (arbitrary choice)
          bestMinTotalAmount = null
        }
      }

      // --- Percentage-based discounts ---
      const percentDiscounts: EventDiscountJson[] = []
      if (bestBulkPercent) percentDiscounts.push(bestBulkPercent)
      if (bestMinTotalPercent) percentDiscounts.push(bestMinTotalPercent)

      // Track which discount is actually being used (for UI display)
      // If a non-stackable discount wins, only that one should show as green
      let isNonStackableWinning = false
      let isStackableWinning = false
      let winningNonStackableDiscount: EventDiscountJson | null = null

      // Approximate total discount value from non‑code percentage discounts
      let approxNonCodePercentDiscount = 0
      // Track whether the chosen non‑code percentage comes from a non‑stackable discount
      let percentNonStackableChosen = false

      if (percentDiscounts.length > 0) {
        // Compute total stackable percentage and best non‑stackable percentage
        let stackablePercent = 0
        let bestNonStackablePercent = 0

        percentDiscounts.forEach((discount) => {
          const pct = discount.discountAmount ?? 0
          if (pct <= 0) return

          const isNonStackable = !!discount.cannotBeStacked

          if (isNonStackable) {
            // Track the best single non‑stackable discount
            bestNonStackablePercent = Math.max(bestNonStackablePercent, pct)
          } else {
            // Stack all stackable discounts
            stackablePercent += pct
          }
        })

        // Decide event percentage from non‑code discounts:
        // - If only stackable: use sum of stackable.
        // - If only non‑stackable: use best non‑stackable.
        // - If both: choose the larger of (stacked) vs (best non‑stackable).
        const nonCodePercent =
          stackablePercent > 0 && bestNonStackablePercent > 0
            ? Math.max(stackablePercent, bestNonStackablePercent)
            : stackablePercent > 0
              ? stackablePercent
              : bestNonStackablePercent
        effectivePercent = nonCodePercent
        // Approximate total discount value from non‑code percentage discounts
        approxNonCodePercentDiscount = totalAfterStudent * (effectivePercent / 100)

        isNonStackableWinning =
          bestNonStackablePercent > 0 &&
          (stackablePercent === 0 || bestNonStackablePercent >= stackablePercent)

        isStackableWinning =
          stackablePercent > 0 &&
          (bestNonStackablePercent === 0 || stackablePercent > bestNonStackablePercent)

        // Record whether the chosen percentage result comes from a non‑stackable discount
        percentNonStackableChosen = isNonStackableWinning

        if (isNonStackableWinning) {
          // Find the non-stackable discount with the winning percentage
          winningNonStackableDiscount =
            percentDiscounts.find(
              (d) => !!d.cannotBeStacked && (d.discountAmount ?? 0) === bestNonStackablePercent
            ) || null
        }
      }

      // --- Amount-based discounts (absolute values) ---
      const amountDiscounts: EventDiscountJson[] = []
      if (bestBulkAmount) amountDiscounts.push(bestBulkAmount)
      if (bestMinTotalAmount) amountDiscounts.push(bestMinTotalAmount)

      let stackableAmount = 0
      let bestNonStackableAmount = 0
      let bestNonStackableAmountDiscount: EventDiscountJson | null = null
      // Track whether the chosen non‑code amount comes from a non‑stackable discount
      let amountNonStackableChosen = false

      if (amountDiscounts.length > 0) {
        amountDiscounts.forEach((discount) => {
          const amount = discount.discountAmount ?? 0
          if (amount <= 0) return

          const isNonStackable = !!discount.cannotBeStacked

          if (isNonStackable) {
            // Track the best single non‑stackable amount discount
            if (amount > bestNonStackableAmount) {
              bestNonStackableAmount = amount
              bestNonStackableAmountDiscount = discount
            }
          } else {
            // Stack all stackable amount discounts
            stackableAmount += amount
          }
        })

        // Decide event amount from non‑code discounts:
        // - If only stackable: use sum of stackable amounts.
        // - If only non‑stackable: use best non‑stackable amount.
        // - If both: choose the larger of (stacked) vs (best non‑stackable).
        const nonCodeAmount =
          stackableAmount > 0 && bestNonStackableAmount > 0
            ? Math.max(stackableAmount, bestNonStackableAmount)
            : stackableAmount > 0
              ? stackableAmount
              : bestNonStackableAmount

        effectiveAmount = nonCodeAmount

        // Record whether the chosen amount result comes from a non‑stackable discount
        if (bestNonStackableAmount > 0 && effectiveAmount === bestNonStackableAmount) {
          amountNonStackableChosen = true
        }
      }

      // Decide between non‑stackable amount and percentage discounts:
      // If a non‑stackable amount discount exists, it should replace
      // percentage discounts when it yields a better total (and vice versa).
      if (bestNonStackableAmount > 0) {
        // Compare approximate discount values (before per‑ticket rounding).
        const amountValue = bestNonStackableAmount
        const percentValue = approxNonCodePercentDiscount

        if (amountValue >= percentValue) {
          // Amount wins: drop non‑code percentage discounts completely.
          // Keep only the best non‑stackable amount as the effective amount.
          effectivePercent = 0
          effectiveAmount = amountValue

          // Update UI flags so the winning non‑stackable amount discount
          // is shown as applied in the discount list.
          percentNonStackableChosen = false
          amountNonStackableChosen = true
          isNonStackableWinning = true
          isStackableWinning = false
          winningNonStackableDiscount = bestNonStackableAmountDiscount
        } else {
          // Percentage wins: drop all amount discounts (both stackable and non-stackable)
          // when the winning percentage is non-stackable.
          if (percentNonStackableChosen) {
            effectiveAmount = 0
          } else {
            // If percentage is stackable, keep stackable amount discounts
            effectiveAmount = stackableAmount
          }
          amountNonStackableChosen = false
        }
      }

      // If a non-stackable percentage discount won and there were no non-stackable
      // amount discounts to compare, we should still compare against stackable amount discounts.
      if (percentNonStackableChosen && bestNonStackableAmount === 0 && effectiveAmount > 0) {
        // Compare non-stackable percentage discount value against stackable amount discounts
        const percentValue = approxNonCodePercentDiscount
        const amountValue = effectiveAmount // This is stackableAmount at this point

        if (amountValue > percentValue) {
          // Stackable amount discounts are better: replace the non-stackable percentage
          effectivePercent = 0
          effectiveAmount = amountValue
          percentNonStackableChosen = false
          isNonStackableWinning = false
          isStackableWinning = true
          winningNonStackableDiscount = null
        } else {
          // Non-stackable percentage is better: drop all amount discounts
          effectiveAmount = 0
          amountNonStackableChosen = false
        }
      }

      // Now incorporate the (possibly verified) Code Discount:
      // - Percentage code: behaves like existing logic (stackable/non‑stackable).
      // - Amount code: adds to or competes with amount-based discounts.
      let isCodeDiscountApplied = false
      let isCodeDiscountWinning = false
      if (appliedCodeDiscount && appliedCodeDiscount.discountAmount > 0) {
        if (appliedCodeDiscount.discountUnit === 'percentage') {
          const codePercent = appliedCodeDiscount.discountAmount
          if (appliedCodeDiscount.cannotBeStacked) {
            // Non‑stackable: pick the better of code vs non‑code percentage
            if (codePercent > effectivePercent) {
              effectivePercent = codePercent
              isCodeDiscountApplied = true
              isCodeDiscountWinning = true
              // Code discount wins, so no non-code discount should show as green
              winningNonStackableDiscount = null
              // Update isNonStackableWinning to true since code discount is winning
              isNonStackableWinning = true
            } else {
              isCodeDiscountApplied = false
            }
          } else {
            // Stackable code discount: if there's a non-stackable bulk discount,
            // compare and replace if code discount is better. Otherwise, add on top.
            if (percentNonStackableChosen) {
              // Compare code discount against non-stackable bulk discount
              if (codePercent > effectivePercent) {
                // Code discount wins: replace the non-stackable bulk discount
                // and drop all amount discounts (stackable and non-stackable)
                effectivePercent = codePercent
                effectiveAmount = 0
                isCodeDiscountApplied = true
                isCodeDiscountWinning = true
                winningNonStackableDiscount = null
                isNonStackableWinning = false
                isStackableWinning = true
                amountNonStackableChosen = false
              } else {
                // Non-stackable bulk discount is better: don't apply code discount
                isCodeDiscountApplied = false
              }
            } else {
              // No non-stackable bulk discount: add stackable code discount on top
              effectivePercent += codePercent
              isCodeDiscountApplied = true
            }
          }
        } else {
          const codeAmount = appliedCodeDiscount.discountAmount
          if (appliedCodeDiscount.cannotBeStacked) {
            // Non‑stackable amount code: compete with existing non‑code discounts.
            // If one of the non‑code parts (percent or amount) is non‑stackable,
            // compare only against that part. Only when both are stackable do we sum them.
            let nonCodeValue = 0
            if (percentNonStackableChosen && !amountNonStackableChosen) {
              nonCodeValue = approxNonCodePercentDiscount
            } else if (!percentNonStackableChosen && amountNonStackableChosen) {
              nonCodeValue = effectiveAmount
            } else {
              nonCodeValue = approxNonCodePercentDiscount + effectiveAmount
            }
            if (codeAmount >= nonCodeValue) {
              // Code amount wins: drop other event discounts
              effectivePercent = 0
              effectiveAmount = codeAmount
              isCodeDiscountApplied = true
              isCodeDiscountWinning = true
              winningNonStackableDiscount = null
              isNonStackableWinning = true
              isStackableWinning = false
            } else {
              isCodeDiscountApplied = false
            }
          } else {
            // Stackable amount code: if there's a non-stackable percentage discount,
            // compare and replace if code discount is better. Otherwise, add to existing amount discounts.
            if (percentNonStackableChosen) {
              // Compare code discount amount against non-stackable percentage discount value
              const percentDiscountValue = approxNonCodePercentDiscount
              if (codeAmount >= percentDiscountValue) {
                // Code discount wins: replace the non-stackable percentage discount
                // and drop all amount discounts (stackable and non-stackable)
                effectivePercent = 0
                effectiveAmount = codeAmount
                isCodeDiscountApplied = true
                isCodeDiscountWinning = true
                winningNonStackableDiscount = null
                isNonStackableWinning = false
                isStackableWinning = true
                amountNonStackableChosen = false
              } else {
                // Non-stackable percentage discount is better: don't apply code discount
                isCodeDiscountApplied = false
              }
            } else {
              // No non-stackable percentage discount: add stackable amount code to existing amount discounts
              effectiveAmount += codeAmount
              isCodeDiscountApplied = true
            }
          }
        }
      }

      // Apply discount per unit and round each (matching Stripe's calculation)
      // Track discount amounts per ticket type for UI display
      const ticketTypeDiscounts: Array<{
        ticketType: string
        quantity: number
        discountAmount: number
        perUnitDiscount: number
        currency: string
      }> = []

      // First apply percentage-based discounts (if any)
      let totalAfterPercentDiscounts = totalAfterStudent

      if (effectivePercent > 0) {
        let sumOfRoundedPrices = 0

        // Apply discount to each seat individually and round
        // Group seats by ticket type for discount display
        const seatDiscountsByType = new Map<
          string,
          { count: number; totalDiscount: number; currency: string }
        >()

        selectedSeatsWithTickets.forEach((item) => {
          const originalPrice = item.price
          const discountedPrice = item.price * (1 - effectivePercent / 100)
          const roundedPrice = Math.round(discountedPrice * 100) / 100
          const discountAmount = originalPrice - roundedPrice
          sumOfRoundedPrices += roundedPrice

          // Track discount by ticket type
          const ticketType = item.ticket.type
          const currency = item.ticket.currency || 'CAD'
          if (!seatDiscountsByType.has(ticketType)) {
            seatDiscountsByType.set(ticketType, {
              count: 0,
              totalDiscount: 0,
              currency,
            })
          }
          const typeData = seatDiscountsByType.get(ticketType)!
          typeData.count += 1
          typeData.totalDiscount += discountAmount
        })

        // Add seat discounts to ticketTypeDiscounts
        seatDiscountsByType.forEach((data, ticketType) => {
          const perUnitDiscount =
            data.count > 0 ? data.totalDiscount / data.count : 0
          ticketTypeDiscounts.push({
            ticketType,
            quantity: data.count,
            discountAmount: Math.round(data.totalDiscount * 100) / 100, // Round to 2 decimals
            perUnitDiscount: Math.round(perUnitDiscount * 100) / 100, // Round to 2 decimals
            currency: data.currency,
          })
        })

        // Apply discount to each ticket unit individually and round
        selectedTickets.forEach((item) => {
          const memberDiscountedPrice = getFinalTicketPrice(item.ticket, {
            isSubscribed,
            hasActiveStudentDiscount,
          })

          // Calculate discount for this ticket type
          const originalTotalPrice = memberDiscountedPrice * item.quantity
          let discountedTotalPrice = 0

          // Apply event discount to each unit of this ticket type and round
          for (let i = 0; i < item.quantity; i++) {
            const discountedPrice =
              memberDiscountedPrice * (1 - effectivePercent / 100)
            const roundedPrice = Math.round(discountedPrice * 100) / 100
            discountedTotalPrice += roundedPrice
            sumOfRoundedPrices += roundedPrice
          }

          // Track discount for this ticket type
          const ticketDiscountAmount = originalTotalPrice - discountedTotalPrice
          const perUnitDiscount =
            item.quantity > 0 ? ticketDiscountAmount / item.quantity : 0
          ticketTypeDiscounts.push({
            ticketType: item.ticket.type,
            quantity: item.quantity,
            discountAmount: Math.round(ticketDiscountAmount * 100) / 100, // Round to 2 decimals
            perUnitDiscount: Math.round(perUnitDiscount * 100) / 100, // Round to 2 decimals
            currency: item.ticket.currency || 'CAD',
          })
        })

        totalAfterPercentDiscounts = sumOfRoundedPrices
      }

      // Then apply amount-based discounts on top of percentage discounts
      const totalAfterAllEventDiscounts = Math.max(
        0,
        totalAfterPercentDiscounts - effectiveAmount
      )

      totalAfterBulk = totalAfterAllEventDiscounts
      bulkDiscountAmount = totalAfterStudent - totalAfterBulk

      return {
        baseTotal,
        totalAfterMembership,
        totalAfterStudent,
        totalAfterBulk,
        membershipDiscountAmount,
        studentDiscountAmount,
        bulkDiscountAmount,
        finalTotal: totalAfterBulk,
        effectivePercent,
        effectiveAmount,
        isCodeDiscountApplied,
        isCodeDiscountWinning, // Track if code discount is winning (non-stackable)
        winningNonStackableDiscount, // Track which discount is actually winning
        isNonStackableWinning, // Track if a non-stackable discount is winning
        isStackableWinning, // Track if stackable discounts are winning
        ticketTypeDiscounts, // Discount amounts per ticket type
      }
    }

    return {
      baseTotal,
      totalAfterMembership,
      totalAfterStudent,
      totalAfterBulk,
      membershipDiscountAmount,
      studentDiscountAmount,
      bulkDiscountAmount,
      finalTotal: totalAfterBulk,
      effectivePercent,
      effectiveAmount: 0,
      isCodeDiscountApplied: false,
      isCodeDiscountWinning: false,
      winningNonStackableDiscount: null,
      isNonStackableWinning: false,
      isStackableWinning: false,
      ticketTypeDiscounts: [], // No discounts applied
    }
  }, [
    selectedSeatsWithTickets,
    selectedTickets,
    totalItemCount,
    isSubscribed,
    hasActiveStudentDiscount,
    type,
    discounts,
    appliedCodeDiscount,
  ])

  // Master checkout handler for multiple ticket types
  const handleMasterCheckout = useCallback(async (
    representativeGuest?: GuestInfo,
    otherGuests?: GuestInfo[],
    eventFormResponses?: FormResponses
  ) => {
    const stripe = await loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
    )
    if (!stripe) {
      toast.error('Error', {
        description: 'Stripe is not available. Please try again later.',
        style: {
          color: '#ef4444',
        },
      })
      return
    }

    try {
      setIsLoading(true)
      // Prepare checkout items: group by ticket type with seat numbers
      const checkoutItems: CheckoutItems = []

      // Add seat-based tickets
      seatsByTicketType.forEach((seats) => {
        const ticket = seats[0].ticket
        const stripePriceIdForUser =
          isSubscribed && ticket.subscribedStripePriceId
            ? ticket.subscribedStripePriceId
            : ticket.stripePriceId

        if (stripePriceIdForUser && ticket.stripeProductId) {
          checkoutItems.push({
            ticketId: ticket.id,
            stripePriceId: stripePriceIdForUser,
            stripeProductId: ticket.stripeProductId,
            seatNumbers: seats.map((s) => s.seatName),
            eventId: ticket.eventId,
          })
        }
      })

      // Add non-seated tickets with quantities
      selectedTickets.forEach((item) => {
        const ticket = item.ticket
        const stripePriceIdForUser =
          isSubscribed && ticket.subscribedStripePriceId
            ? ticket.subscribedStripePriceId
            : ticket.stripePriceId

        if (stripePriceIdForUser && ticket.stripeProductId && item.quantity >= 1) {
          // Non-seated tickets have empty seatNumbers array
          checkoutItems.push({
            ticketId: ticket.id,
            stripePriceId: stripePriceIdForUser,
            stripeProductId: ticket.stripeProductId,
            seatNumbers: [], // Empty for non-seated tickets
            eventId: ticket.eventId,
            quantity: item.quantity, // Quantity for non-seated tickets
          })
        }
      })

      if (checkoutItems.length === 0) {
        toast.error('Error', {
          description: 'No valid tickets found for checkout.',
        })
        return
      }

      // Stored shape matches Payment.formResponses: [{ email, responses: [...] }]
      const formResponderEmail = (
        representativeGuest?.email ||
        userInfo?.email ||
        ''
      ).trim().toLowerCase()
      
      const formattedFormResponses =
        eventFormResponses &&
          Object.keys(eventFormResponses).length > 0 &&
          formResponderEmail
          ? [
            {
              email: formResponderEmail,
              responses: Object.entries(eventFormResponses).map(
                ([questionId, answer]) => {
                  const question = eventFormData?.flatMap((f) => f.questions).find((q) => q.id === questionId)
                  const rawFn = answer?.formNumber
                  const formNumber =
                    typeof rawFn === 'number' && rawFn > 0 ? rawFn : 1
                  return {
                    questionId,
                    question: question?.question || '',
                    answer: answer?.answer,
                    questionType: question?.type || '',
                    required: question?.required ?? false,
                    options: question?.options || [],
                    formNumber,
                  }
                }
              ),
            },
          ]
          : null

      // Call API endpoint for multi-ticket checkout
      const { data } = await axiosInstance.post(
        '/api/payment/checkout-sessions/create-multi',
        {
          eventKeyName,
          userId: userId || '',
          eventId,
          type,
          mainEmail: representativeGuest?.email || userInfo?.email || '',
          pricingIsSubscribed: isSubscribed,
          pricingHasStudentDiscount: hasActiveStudentDiscount,
          checkoutItems,
          // Only send the code - server will re-verify to prevent tampering
          ...(appliedCodeDiscount && {
            discountCode: appliedCodeDiscount.code,
          }),
          // Guest information (only if userId is not provided)
          ...(representativeGuest && {
            guestName: representativeGuest.name,
            guestPhone: representativeGuest.phone,
          }),
          // Other guests information
          ...(otherGuests && otherGuests.length > 0 && {
            otherGuestsInfo: otherGuests.map(guest => ({
              name: guest.name,
              email: guest.email,
              phone: guest.phone,
            })),
          }),
          // Event form responses
          ...(formattedFormResponses && {
            formResponses: formattedFormResponses,
          }),
        }
      )

      const result = await stripe.redirectToCheckout({ sessionId: data.id })

      if (result.error) {
        toast.error('Error', {
          description: `Stripe redirect error: ${result.error.message}`,
        })
      }
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        toast.error('Error', {
          description:
            error.response?.data?.message ||
            'A network or server error occurred. Please try again.',
        })
      } else if (error instanceof Error) {
        toast.error('Error', {
          description: error.message || 'Unexpected error occurred.',
        })
      } else {
        toast.error('Error', {
          description:
            'Unexpected error occurred. Please contact our developer team for support.',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }, [
    seatsByTicketType,
    selectedTickets,
    isSubscribed,
    hasActiveStudentDiscount,
    eventKeyName,
    userId,
    eventId,
    type,
    userInfo,
    isGuestCheckout,
    appliedCodeDiscount,
    eventFormData,
  ])

  const handleCheckoutButtonClick = () => {
    // Show checkout dialog (will start with guest form)
    setShowCheckoutDialog(true)
  }

  const handleGuestFormSubmit = (guestInfo: {
    guestName: string
    guestEmail: string
    guestPhone: string
    otherGuests: Array<{ name: string; email: string; phone: string }>
  }) => {
    // Save guest info
    setGuestInfo({
      representativeGuest: {
        name: guestInfo.guestName,
        email: guestInfo.guestEmail,
        phone: guestInfo.guestPhone,
      },
      otherGuests: guestInfo.otherGuests,
    })

    // If there's no event form, proceed directly to checkout
    if (!eventFormData || !eventFormData.some(f => f.questions.length > 0)) {
      setShowCheckoutDialog(false)
      handleMasterCheckout(
        {
          name: guestInfo.guestName,
          email: guestInfo.guestEmail,
          phone: guestInfo.guestPhone,
        },
        guestInfo.otherGuests
      )
    }
  }

  const handleEventFormSubmit = (formResponses: FormResponses) => {
    setShowCheckoutDialog(false)
    handleMasterCheckout(guestInfo.representativeGuest, guestInfo.otherGuests, formResponses)
  }

  return (
    <>
      {isLoading && <Loader />}
      <div className="w-full">
        <div className="pt-2">
          {/* Cart Header */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="web_h3 font-semibold text-gray-900">
              {t('cart', {
                count:
                  selectedSeatsWithTickets.length +
                  selectedTickets.reduce(
                    (sum, item) =>
                      sum + item.quantity * (item.ticket.capacityPerTicket ?? 1),
                    0
                  ),
              })}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCart}
              className="text-sm text-red-600 hover:text-gray-700"
              disabled={isLoading}
            >
              {t('clear-all')}
            </Button>
          </div>

          {/* Selected Seats List */}
          <div className="space-y-2">
            {selectedSeatsWithTickets.map((seat) => {
              const basePrice = seat.price
              const discountPercent = getMemberDiscountPercent(seat.ticket)
              const hasMemberDiscount =
                isSubscribed &&
                discountPercent > 0 &&
                seat.ticket.discountMemberPercent != null

              // Calculate member price for this seat
              const memberPrice = getFinalTicketPrice(seat.ticket, {
                isSubscribed: hasMemberDiscount,
                hasActiveStudentDiscount,
              })
              const hasAnyDiscount = hasMemberDiscount || hasActiveStudentDiscount
              const displayPrice = hasAnyDiscount ? memberPrice : basePrice
              const currency = seat.ticket.currency || 'CAD'
              const totalPercentOff = hasAnyDiscount
                ? Number(
                  getCombinedMemberStudentPercentOff(
                    hasMemberDiscount,
                    discountPercent,
                    hasActiveStudentDiscount
                  ).toFixed(1)
                )
                : 0

              return (
                <div
                  key={`${seat.rowIndex}-${seat.seatIndex}`}
                  className="flex items-center justify-between rounded border bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {seat.seatName}
                    </span>
                    <span className="text-xs text-gray-500">
                      {seat.ticket.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-0.5">
                      {hasAnyDiscount && (
                        <>
                          <span className="text-xs text-gray-400 line-through">
                            {currency} ${basePrice.toFixed(2)}
                          </span>
                          <span className="text-xs font-medium text-green-600">
                            {totalPercentOff}% off
                          </span>
                        </>
                      )}
                      <span className="text-sm font-semibold text-gray-900">
                        {currency} ${displayPrice.toFixed(2)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSeat(seat.rowIndex, seat.seatIndex)}
                      className="h-6 w-6 rounded p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                      aria-label={`Remove ${seat.seatName}`}
                      disabled={isLoading}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )
            })}

            {/* Selected Tickets List (non-seated) */}
            {selectedTickets.map((item) => {
              const basePrice =
                getTicketUnitPrice(item.ticket) * Math.max(0, item.quantity)
              const discountPercent = getMemberDiscountPercent(item.ticket)
              const hasMemberDiscount =
                isSubscribed &&
                discountPercent > 0 &&
                item.ticket.discountMemberPercent != null

              // Final line price: member % + student % off list (additive), same as getFinalTicketPrice
              const memberPrice = getFinalTicketPrice(item.ticket, {
                isSubscribed: hasMemberDiscount,
                hasActiveStudentDiscount,
                quantity: item.quantity,
              })
              const hasAnyDiscount = hasMemberDiscount || hasActiveStudentDiscount
              const displayPrice = hasAnyDiscount ? memberPrice : basePrice
              const currency = item.ticket.currency || 'CAD'
              const totalPercentOff = hasAnyDiscount
                ? Number(
                  getCombinedMemberStudentPercentOff(
                    hasMemberDiscount,
                    discountPercent,
                    hasActiveStudentDiscount
                  ).toFixed(1)
                )
                : 0

              return (
                <div
                  key={item.ticket.id}
                  className="flex items-center justify-between rounded border bg-white shadow-sm p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {item.ticket.type} × {item.quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-0.5">
                      {hasAnyDiscount && (
                        <>
                          <span className="text-xs text-gray-400 line-through">
                            {currency} ${basePrice.toFixed(2)}
                          </span>
                          <span className="text-xs font-medium text-green-600">
                            {totalPercentOff}% off
                          </span>
                        </>
                      )}
                      <span className="text-sm font-semibold text-gray-900">
                        {currency} ${displayPrice.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Discount Information */}
          {(priceBreakdown.effectivePercent > 0 || discountList.length > 0) && (
            <div className="mt-4 space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
              <h4 className="text-sm font-semibold text-green-900">
                {t('available-discounts')}
              </h4>
              <div className="space-y-1 text-xs text-gray-700">
                <p>
                  <strong>{t('effective-discount')}</strong>{' '}
                  {priceBreakdown.effectivePercent > 0 && priceBreakdown.effectiveAmount > 0 && (
                    <>
                      {t('percent-off-applied', {
                        percent: priceBreakdown.effectivePercent,
                      })}{' '}
                      + ${priceBreakdown.effectiveAmount.toFixed(2)} off
                    </>
                  )}
                  {priceBreakdown.effectivePercent > 0 && priceBreakdown.effectiveAmount === 0 && (
                    <>
                      {t('percent-off-applied', {
                        percent: priceBreakdown.effectivePercent,
                      })}
                    </>
                  )}
                  {priceBreakdown.effectivePercent === 0 && priceBreakdown.effectiveAmount > 0 && (
                    <>
                      ${priceBreakdown.effectiveAmount.toFixed(2)} off
                    </>
                  )}
                  {priceBreakdown.effectivePercent === 0 && priceBreakdown.effectiveAmount === 0 && (
                    <>
                      {t('no-discounts-applied')}
                    </>
                  )}
                  {appliedCodeDiscount?.cannotBeStacked
                    ? priceBreakdown.isCodeDiscountApplied && (
                      <span className="text-xs text-gray-700">
                        {' '}
                        {t('code-discount-not-stackable')}
                      </span>
                    )
                    : priceBreakdown.isCodeDiscountApplied && (
                      <span className="text-xs text-gray-700">
                        {' '}
                        {appliedCodeDiscount &&
                          appliedCodeDiscount.discountUnit === 'amount'
                          ? t('code-discount-applied-amount', {
                            amount:
                              appliedCodeDiscount.discountAmount.toFixed(2),
                          })
                          : appliedCodeDiscount
                            ? t('code-discount-applied', {
                              percent: appliedCodeDiscount.discountAmount,
                            })
                            : null}
                      </span>
                    )}
                </p>
              </div>

              {isDiscountsExpanded && (
                <div className="mt-2 space-y-3">
                  {discountList.length === 0 && (
                    <p className="text-xs text-gray-600">
                      No discounts available for this event.
                    </p>
                  )}

                  {/* Bulk Discounts Group */}
                  {discountList.some((d) => d.type === 'Bulk Discount') && (
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold text-green-900">
                        Bulk Discounts
                      </p>
                      {discountList
                        .filter((d) => d.type === 'Bulk Discount')
                        .sort((a, b) => (a.discountAmount ?? 0) - (b.discountAmount ?? 0))
                        .map((discount, index) => {
                          const key = discount.id || `bulk-${index}`
                          const amount = discount.discountAmount ?? 0
                          const unit = discount.discountUnit ?? 'percentage'
                          const totalItemCount =
                            selectedSeatsWithTickets.length +
                            selectedTickets.reduce(
                              (sum, item) => sum + item.quantity,
                              0
                            )
                          const minQty = discount.minQuantity ?? 0
                          const technicallyQualifies = totalItemCount >= minQty

                          // Determine if this discount is actually applied:
                          // 1. If code discount (non-stackable) is winning: no bulk discount should be applied
                          // 2. If non-stackable discount is winning: only that specific discount
                          // 3. If stackable is winning: only stackable discounts
                          // 4. Otherwise: all qualifying discounts
                          const isActuallyApplied = technicallyQualifies &&
                            !priceBreakdown.isCodeDiscountWinning && // Code discount wins -> no bulk discount applied
                            (
                              // Case 1: Non-stackable is winning - only that specific one
                              (priceBreakdown.isNonStackableWinning && priceBreakdown.winningNonStackableDiscount?.id === discount.id) ||
                              // Case 2: Stackable is winning - only if this discount is stackable
                              (priceBreakdown.isStackableWinning && !discount.cannotBeStacked) ||
                              // Case 3: Neither is winning (shouldn't happen, but fallback)
                              (!priceBreakdown.isNonStackableWinning && !priceBreakdown.isStackableWinning)
                            )

                          // Check if a better discount is chosen:
                          // 1. If code discount (non-stackable) is winning
                          // 2. If non-stackable discount is winning and this isn't it
                          // 3. If stackable discounts are winning and this is non-stackable
                          const betterDiscountChosen = technicallyQualifies && !isActuallyApplied &&
                            (priceBreakdown.isCodeDiscountWinning ||
                              priceBreakdown.isNonStackableWinning ||
                              (priceBreakdown.isStackableWinning && discount.cannotBeStacked))

                          const needed = Math.max(
                            0,
                            minQty - totalItemCount
                          )

                          return (
                            <div
                              key={key}
                              className="flex items-start gap-2"
                            >
                              <span
                                className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${isActuallyApplied
                                  ? 'bg-green-200 text-green-900'
                                  : 'bg-gray-200 text-gray-500'
                                  }`}
                              >
                                {isActuallyApplied ? '✓' : '✗'}
                              </span>
                              <span
                                className={
                                  isActuallyApplied
                                    ? 'text-green-800 pt-1'
                                    : 'text-gray-600 pt-1'
                                }
                              >
                                <strong>
                                  {unit === 'percentage'
                                    ? t('bulk-discount-percent-off-for-items', {
                                      percent: amount,
                                      minQty,
                                    })
                                    : `${amount.toFixed(2)} off for minimum ${minQty} items`}
                                </strong>
                                {' '}({discount.cannotBeStacked
                                  ? t('minimum-discount-non-stackable')
                                  : t('minimum-discount-stackable')})
                                {isActuallyApplied
                                  ? ` ${t('bulk-discount-currently-applied', { count: totalItemCount })}`
                                  : betterDiscountChosen
                                    ? ` ${t('bulk-discount-better-chosen')}`
                                    : needed > 0
                                      ? ` ${t('bulk-discount-add-more-to-qualify', { count: needed })}`
                                      : ` ${t('bulk-discount-add-more-items')}`}
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  )}

                  {/* Minimum Total Discounts Group */}
                  {discountList.some(
                    (d) => d.type === 'Minimum Total Discount'
                  ) && (
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-green-900">
                          Minimum Total Discounts
                        </p>
                        {discountList
                          .filter((d) => d.type === 'Minimum Total Discount')
                          .sort((a, b) => (a.discountAmount ?? 0) - (b.discountAmount ?? 0))
                          .map((discount, index) => {
                            const key = discount.id || `minTotal-${index}`
                            const amount = discount.discountAmount ?? 0
                            const unit = discount.discountUnit ?? 'percentage'
                            const minTotal = discount.minTotal ?? 0
                            const cartTotal = priceBreakdown.totalAfterStudent
                            const technicallyQualifies = cartTotal >= minTotal

                            // Determine if this discount is actually applied:
                            // 1. If non-stackable is winning: only that specific discount
                            // 2. If stackable is winning: only stackable discounts
                            // 3. Otherwise: all qualifying discounts
                            const isActuallyApplied = technicallyQualifies &&
                              (
                                // Case 1: Non-stackable is winning - only that specific one
                                (priceBreakdown.isNonStackableWinning && priceBreakdown.winningNonStackableDiscount?.id === discount.id) ||
                                // Case 2: Stackable is winning - only if this discount is stackable
                                (priceBreakdown.isStackableWinning && !discount.cannotBeStacked) ||
                                // Case 3: Neither is winning (shouldn't happen, but fallback)
                                (!priceBreakdown.isNonStackableWinning && !priceBreakdown.isStackableWinning)
                              )

                            // Check if a better discount is chosen:
                            // 1. If non-stackable discount is winning and this isn't it
                            // 2. If stackable discounts are winning and this is non-stackable
                            const betterDiscountChosen = technicallyQualifies && !isActuallyApplied &&
                              (priceBreakdown.isNonStackableWinning ||
                                (priceBreakdown.isStackableWinning && discount.cannotBeStacked))

                            const needed = Math.max(
                              0,
                              minTotal - cartTotal
                            )

                            return (
                              <div
                                key={key}
                                className="flex items-start gap-2"
                              >
                                <span
                                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${isActuallyApplied
                                    ? 'bg-green-200 text-green-900'
                                    : 'bg-gray-200 text-gray-500'
                                    }`}
                                >
                                  {isActuallyApplied ? '✓' : '✗'}
                                </span>
                                <span
                                  className={
                                    isActuallyApplied
                                      ? 'text-green-800 pt-1'
                                      : 'text-gray-600 pt-1'
                                  }
                                >
                                  <strong>
                                    {unit === 'percentage'
                                      ? t('minimum-discount-percent-off-for-orders', {
                                        percent: amount,
                                        minTotal: minTotal.toFixed(2),
                                      })
                                      : `$${amount.toFixed(2)} off for orders over ${minTotal.toFixed(2)}`}
                                  </strong>
                                  {' '}({discount.cannotBeStacked
                                    ? t('minimum-discount-non-stackable')
                                    : t('minimum-discount-stackable')})
                                  {isActuallyApplied
                                    ? ` ${t('minimum-discount-currently-applied', { cartTotal: cartTotal.toFixed(2) })}`
                                    : betterDiscountChosen
                                      ? ` ${t('minimum-discount-better-chosen')}`
                                      : ` ${t('minimum-discount-add-amount-to-qualify', { needed: needed.toFixed(2) })}`}
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    )}

                  {/* Code Discount entry moved to the price breakdown section */}

                  {/* Note about rounding */}
                  <p className="mt-3 text-xs text-gray-500 italic">
                    {t('discount-rounding-note-prefix')}
                    <span className="font-semibold">{t('discount-rounding-note-bold')}</span>
                    {t('discount-rounding-note-suffix')}
                  </p>
                </div>
              )}

              {/* Expand / Collapse Toggle */}
              {discountList.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setIsDiscountsExpanded((prev) => !prev)
                  }
                  className="flex w-full items-center justify-center gap-1 text-xs font-medium text-green-800 hover:text-green-900"
                >
                  <span>
                    {isDiscountsExpanded
                      ? t('toggle-hide-discount-details')
                      : t('toggle-show-discount-details')}
                  </span>
                  <span
                    className={`transition-transform ${isDiscountsExpanded ? 'rotate-180' : 'rotate-0'
                      }`}
                  >
                    ▼
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Discount Code (only if event has Code Discount) */}
          <div className="flex items-center justify-between text-gray-600 border-t pt-4 mt-4">
            <span className="text-sm text-gray-600">{t('checkout-discount-code')}</span>
            <div className="flex w-[240px] items-center gap-2">
              <input
                type="text"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder={t('checkout-enter-discount-code') || ''}
                className="h-8 w-full rounded border border-gray-300 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <Button
                type="button"
                size="sm"
                variant={appliedCodeDiscount ? 'destructive' : 'outline'}
                className={`h-8 text-xs ${appliedCodeDiscount ? 'bg-red-600 hover:bg-red-700' : ''}`}
                onClick={() => {
                  if (appliedCodeDiscount) {
                    handleRemoveCodeDiscount()
                    return
                  }
                  if (!discountCode.trim()) {
                    toast.error(t('checkout-discount-code-required-title'), {
                      description: t('checkout-discount-code-required-desc'),
                      style: {
                        color: '#ef4444',
                      },
                    })
                    return
                  }
                  handleVerifyDiscountCode(discountCode)
                }}
                disabled={isVerifyingCode || (cooldownRemaining > 0 && !appliedCodeDiscount)}
              >
                {isVerifyingCode ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : appliedCodeDiscount ? (
                  t('checkout-remove')
                ) : cooldownRemaining > 0 ? (
                  t('checkout-wait-seconds', { seconds: cooldownRemaining })
                ) : (
                  t('checkout-apply')
                )}
              </Button>
            </div>
          </div>

          {appliedCodeDiscount && (
            <div className="flex items-center text-xs text-green-700">
              <span className={`pt-1 ${priceBreakdown.isCodeDiscountApplied ? 'text-green-700' : 'text-red-600'}`}>
                {priceBreakdown.isCodeDiscountApplied ? <span>
                  {t('checkout-code-applied')}{' '}
                  <span className="font-semibold">{appliedCodeDiscount.code}</span>{' '}
                  ({appliedCodeDiscount.discountUnit === 'amount'
                    ? `$${appliedCodeDiscount.discountAmount.toFixed(2)} ${t('checkout-off')}`
                    : `${appliedCodeDiscount.discountAmount}% ${t('checkout-off')}`
                  }
                  {appliedCodeDiscount.cannotBeStacked ? `, ${t('checkout-non-stackable')}` : ''})
                </span> : <span>
                  ({appliedCodeDiscount.discountUnit === 'amount'
                    ? `$${appliedCodeDiscount.discountAmount.toFixed(2)} ${t('checkout-off')}`
                    : `${appliedCodeDiscount.discountAmount}% ${t('checkout-off')}`
                  }, {appliedCodeDiscount.cannotBeStacked ? t('checkout-non-stackable') : ''} - {t('checkout-not-used-better-discount')})
                </span>}
              </span>
            </div>
          )}


          {/* Total Price */}
          <div className="mt-4 space-y-2 border-t pt-4">
            {/* Price Breakdown */}
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-gray-600">
                <span>{t('checkout-subtotal')}</span>
                <span>
                  {selectedSeatsWithTickets[0]?.ticket.currency || 'CAD'} $
                  {priceBreakdown.totalAfterStudent.toFixed(2)}
                </span>
              </div>

              {/* Event Discounts (Bulk / Min Total / Code combined) */}
              {priceBreakdown.bulkDiscountAmount > 0 && (
                <div className="flex items-center justify-between text-green-600">
                  <span className="max-w-[150px] md:max-w-[250px]">
                    {priceBreakdown.effectivePercent > 0 &&
                      priceBreakdown.effectiveAmount > 0 ? (
                      <>
                        {t('checkout-event-discounts-with-percent', {
                          percent: priceBreakdown.effectivePercent,
                        })}{' '}
                        + $
                        {priceBreakdown.effectiveAmount.toFixed(2)} off
                      </>
                    ) : priceBreakdown.effectivePercent > 0 ? (
                      <>
                        {t('checkout-event-discounts-with-percent', {
                          percent: priceBreakdown.effectivePercent,
                        })}
                      </>
                    ) : (
                      <>
                        Event Discounts - $
                        {priceBreakdown.effectiveAmount.toFixed(2)} off
                      </>
                    )}
                  </span>
                  <span>
                    {(() => {
                      const currency =
                        selectedSeatsWithTickets[0]?.ticket.currency ||
                        selectedTickets[0]?.ticket.currency ||
                        'CAD'
                      const flatAmount = priceBreakdown.effectiveAmount > 0
                        ? priceBreakdown.effectiveAmount
                        : 0

                      if (priceBreakdown.effectivePercent > 0 && flatAmount > 0) {
                        return (
                          <span className="whitespace-nowrap">
                            - (${priceBreakdown.totalAfterStudent.toFixed(2)} × {priceBreakdown.effectivePercent}% + ${flatAmount.toFixed(2)})
                          </span>
                        )
                      }
                      if (priceBreakdown.effectivePercent > 0) {
                        return (
                          <span className="whitespace-nowrap">
                            - ${priceBreakdown.totalAfterStudent.toFixed(2)} × {priceBreakdown.effectivePercent}%
                          </span>
                        )
                      }
                      return (
                        <span className="whitespace-nowrap">
                          -{currency} ${flatAmount.toFixed(2)}
                        </span>
                      )
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* Final Total */}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-lg font-semibold text-gray-900">{t('checkout-total')}</span>
              <span className="text-xl font-bold text-primary">
                {selectedSeatsWithTickets[0]?.ticket.currency || 'CAD'} $
                {priceBreakdown.finalTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Master Checkout Button */}
          <div className="mt-4">
            {!isLoadingSubscription && (
              <Button
                onClick={handleCheckoutButtonClick}
                className="group mt-4 w-full"
                disabled={
                  (selectedSeatsWithTickets.length === 0 && selectedTickets.length === 0) ||
                  isLoading
                }
              >
                {t('reserve-button')}{' '}
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            )}
          </div>

          {/* Checkout Dialog with Animated Form Transitions */}
          <EventCheckoutDialog
            open={showCheckoutDialog}
            onOpenChange={setShowCheckoutDialog}
            onGuestFormSubmit={handleGuestFormSubmit}
            onEventFormSubmit={handleEventFormSubmit}
            totalGuestRequired={totalItemCount || 1}
            userId={userId || null}
            userInfo={userInfo || null}
            eventFormData={eventFormData}
            isLoading={isLoading}
            t={t}
          />
        </div>
      </div>
    </>
  )
}
