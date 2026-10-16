import PaymentSuccess from '@/components/payment/PaymentSuccess'
import { getEventTitleByKeyName } from '@/lib/actions/event/getEvent'
import { getReferralShareForSuccess } from '@/lib/actions/referral/ticketReferral'
import { auth } from '@/auth'

// No use of header or live database, but uses auth() so can be dynamic
export const dynamic = 'force-dynamic'

// Interfaces
interface EventPaymentSuccessPageProps {
  params: Promise<{ locale: string; eventKeyName: string }>
  searchParams: Promise<{ session_id?: string }>
}

// Main Component
const EventPaymentSuccessPage = async ({
  params,
  searchParams,
}: EventPaymentSuccessPageProps) => {
  const { locale, eventKeyName } = await params
  const { session_id: sessionId } = await searchParams

  const publishedEvent = await getEventTitleByKeyName(eventKeyName)

  if (!publishedEvent) return null

  // Check if user is authenticated
  const session = await auth()
  const isGuestCheckout = !session?.user
  let referral: { code: string; link: string } | null = null
  try {
    referral = await getReferralShareForSuccess({
      eventKeyName,
      stripeSessionId: sessionId,
      locale,
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      userId: session?.user?.id,
    })
  } catch (error) {
    console.error('[PAYMENT_SUCCESS_REFERRAL]', error)
  }

  return (
    <PaymentSuccess
      title={publishedEvent.title}
      locale={locale}
      translationWorkspaces={['event']}
      isGuestCheckout={isGuestCheckout}
      referralCode={referral?.code}
      referralLink={referral?.link}
    />
  )
}

export default EventPaymentSuccessPage
