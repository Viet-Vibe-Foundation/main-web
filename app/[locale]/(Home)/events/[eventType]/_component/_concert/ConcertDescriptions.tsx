import React from 'react'

// Libraries
import initTranslation from '@/app/i18n'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { getEventPrices } from '@/lib/actions/event/getEventPrices'
import { checkCurrentSoldCapacityById } from '@/lib/actions/event/checkCurrentSoldCapacityById'
import moment from 'moment-timezone'

// Components
import { CalendarDays, Ticket, Users, MapPin, Clock } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import AddReviewButton from '@/components/review/AddReviewButton'
import ShareButton from '@/components/ui/share-button'
import TextPreview from '@/components/quill/TextPreview'
import PaymentOptions from '../_stripepayment/PaymentOptions'
import ScrollToCheckoutButton from './ScrollToCheckoutButton'
import EventGalleryCarousel from '../EventGalleryCarousel'
import SponsorsList from '../../../_components/SponsorsList'
import ServerError from '@/components/error/ServerError'
import VolunteerSection from '../_class/VolunteerSection'
import EventVotingPanel from '../EventVotingPanel'
// Types
import { EventSchedule, EventTicket, EventSponsor, SponsorTier, Job, Payment } from '@prisma/client'
import { SeatingMap } from '../../../(Admin)/editEvent/[eventKeyName]/_components/EventSeating'
import { JsonValue } from '@prisma/client/runtime/library'

type SponsorOnEvent = {
  tier: SponsorTier
  order: number | null
  sponsor: EventSponsor
}

type EventWithRelations = {
  id: string
  title: string
  subtitle: string | null
  description: string | null
  location: string | null
  startTime: string | null
  endTime: string | null
  capacity: number | null
  startDate: Date | null
  endDate: Date
  stripePriceId: string | null
  stripeProductId: string | null
  subscribedPriceId: string | null
  formLink: string | null
  keyName: string
  hosts: { name: string | null }[]
  schedules: EventSchedule[]
  eventType: string
  imgUrls: string[]
  days: string[]
  tickets: EventTicket[]
  sponsors: SponsorOnEvent[]
  jobs: Job[]
  eventDiscounts: JsonValue
}

interface ConcertDescriptionsProps {
  event: EventWithRelations
  locale: string
  reviewsCount: number
  seriesId?: string
  seatingMap: SeatingMap
}

const typeMap = {
  CLASS: 'Class',
  CONCERT: 'Concert',
  CAMPING: 'Camping',
  EVENT: 'Event',
}

const ConcertDescriptions = async ({
  event,
  locale,
  reviewsCount,
  seriesId,
  seatingMap,
}: ConcertDescriptionsProps) => {
  const { t } = await initTranslation(locale, ['event', 'common'])

  // Get the current user's id
  const session = await auth()
  const author = session?.user?.id!

  // Convert dates to Vancouver timezone for comparison and display
  const startDateVancouver = event.startDate
    ? moment(event.startDate).tz('America/Vancouver')
    : null
  const endDateVancouver = moment(event.endDate).tz('America/Vancouver')
  const isSameDate =
    startDateVancouver?.format('YYYY-MM-DD') ===
    endDateVancouver.format('YYYY-MM-DD')

  // Check if user has already paid for this event
  let existingPayment: Payment[] | null = null
  if (author) {
    try {
      existingPayment = await prisma.payment.findMany({
        where: {
          AND: [{ userId: author }, { eventId: event.id }],
        },
      })
    } catch (error) {
      console.error(`Error fetching existing payments in ConcertDescriptions of event ${event.title}:`, error)
      existingPayment = null
    }
  }

  // Calculate total sold capacity: sum of (payment.quantity * ticket.capacityPerTicket) for all non-refunded payments
  const totalSoldCapacity = await checkCurrentSoldCapacityById(event.id)
  if (totalSoldCapacity === -1) {
    return <ServerError showHomeButton={true} />
  }

  const isCapacityExceeded = event.capacity !== null && totalSoldCapacity >= event.capacity

  return (
    <div className="w-full bg-bgColor-secondary200 py-3">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start gap-y-6 p-3 md:p-10 lg:gap-y-8 lg:p-12">
        <div className="flex w-full items-center justify-between">
          <h2 className="web_h2 hidden md:block">{t('headerAbout')}</h2>
          <h2 className="web_h2 block md:hidden">{t('headerAboutMobile')}</h2>
          {/* Share & Reviews */}
          <div className="col-span-2 flex flex-col items-end gap-2 place-self-end pr-6 md:col-span-1">
            {!seriesId && reviewsCount > 0 && (
              <Link
                href={`/posts?reviewEvent=${event.id}&reviewPage=1&redirectToReviewsSection=true`}
                className="group inline-flex items-center gap-1 whitespace-nowrap text-sm text-bgColor-brand900 hover:text-bgColor-brandDark900 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="hidden sm:inline">
                  {t('jumpToReviewsSection')}
                </span>
                <span className="sm:hidden">{t('jumpToReviews')}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />{' '}
              </Link>
            )}
            {seriesId && (
              <Link
                href={`/posts?reviewSeries=${seriesId}&reviewPage=1&redirectToReviewsSection=true`}
                className="group inline-flex items-center gap-1 whitespace-nowrap text-sm text-bgColor-brand900 hover:text-bgColor-brandDark900 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="hidden sm:inline">
                  {t('jumpToReviewsSectionSeries')}
                </span>
                <span className="sm:hidden">{t('jumpToReviews')}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />{' '}
              </Link>
            )}
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShareButton />
                  </TooltipTrigger>
                  <TooltipContent className="bg-bgColor-black">
                    <p className="text-sm text-textColor-brand600">Share</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <AddReviewButton user={session?.user} useIcon={true} />
            </div>
          </div>
        </div>

        {/* Event Info Section */}
        <div className="flex w-full flex-col gap-y-8 md:grid md:grid-cols-[1fr_400px] md:justify-between md:gap-x-4 md:gap-y-4 lg:grid-cols-[1fr_450px] xl:grid-cols-[1fr_550px]">
          {/* Event Description */}
          {/* <h1 className="mb-4 text-xl font-bold md:text-3xl lg:text-4xl">
            {t('headerAbout')}
          </h1> */}

          <div className="w-full text-pretty">
            <TextPreview value={event.description || ''} />
          </div>
          {/* <p className="mt-2 text-muted-foreground">
          (To become a VVF member, please refer to the registration form using
          the reserve button below)
        </p> */}

          {/* Info Section */}
          <div className="md:pl-[clamp(20px,4vw,100px)]">
            <h1 className="mb-5 text-xl font-bold md:hidden md:text-3xl lg:text-4xl">
              {t('headerInfo')}
            </h1>
            <div className="sticky top-[120px] z-[5] -mt-5 flex flex-col gap-y-[clamp(0.5rem,2vh,2.5rem)] px-[15px] py-5 md:px-[20px]">
              <div className="flex h-[50vh] min-h-0 flex-col gap-y-[clamp(0.5rem,2vh,2.5rem)]">
                {/* Info Card */}
                <div className="flex min-h-0 shrink flex-col rounded-2xl bg-white shadow-[0_0_15px_rgba(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_0_25px_rgba(0,0,0,0.2)]">
                  {/* Date Row */}
                  <div className="relative p-[clamp(0.5rem,1.5vh,1rem)]">
                    <div className="flex items-center gap-x-3">
                      <CalendarDays className="h-[clamp(0.75rem,2vh,1.25rem)] w-[clamp(0.75rem,2vh,1.25rem)] shrink-0 text-red-600" />
                      <span className="text-[clamp(0.75rem,1.5vh,1rem)]">
                        {startDateVancouver?.format('MMM D, YYYY')}
                        {!isSameDate && (
                          <>
                            {' - '}
                            {endDateVancouver.format('MMM D, YYYY')}
                          </>
                        )}{' '}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-1/2 w-[93%] -translate-x-1/2 border-b border-gray-200"></div>
                  </div>

                  {/* Time Row */}
                  <div className="relative p-[clamp(0.5rem,1.5vh,1rem)]">
                    <div className="flex items-center gap-x-3">
                      <Clock className="h-[clamp(0.75rem,2vh,1.25rem)] w-[clamp(0.75rem,2vh,1.25rem)] shrink-0 text-red-600" />
                      <span className="text-[clamp(0.75rem,1.5vh,1rem)]">
                        {event.days
                          .map((day: string) => {
                            const translated = t(day.toLowerCase())
                            return (
                              translated.charAt(0).toUpperCase() +
                              translated.slice(1).toLowerCase()
                            )
                          })
                          .join(', ')}{' '}
                        at {event.startTime} - {event.endTime}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-1/2 w-[93%] -translate-x-1/2 border-b border-gray-200"></div>
                  </div>

                  {/* Price Row */}
                  <div className="relative p-[clamp(0.5rem,1.5vh,1rem)]">
                    <div className="flex items-center gap-x-3">
                      <Ticket className="h-[clamp(0.75rem,2vh,1.25rem)] w-[clamp(0.75rem,2vh,1.25rem)] shrink-0 rotate-[135deg] text-red-600" />
                      <span className="text-[clamp(0.75rem,1.5vh,1rem)]">
                        {getEventPrices(event.tickets)}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-1/2 w-[93%] -translate-x-1/2 border-b border-gray-200"></div>
                  </div>

                  {/* Spots Left Row */}
                  <div className="relative p-[clamp(0.5rem,1.5vh,1rem)]">
                    <div className="flex items-center justify-between gap-x-3">
                      <div className="flex items-center gap-x-3">
                        <Users className="h-[clamp(0.75rem,2vh,1.25rem)] w-[clamp(0.75rem,2vh,1.25rem)] shrink-0 text-red-600" />
                        <span className="text-[clamp(0.75rem,1.5vh,1rem)]">
                          {event.capacity} {t('spots')}
                        </span>
                      </div>
                    </div>
                    <div className="absolute bottom-0 left-1/2 w-[93%] -translate-x-1/2 border-b border-gray-200"></div>
                  </div>

                  {/* Location Row */}
                  <div className="flex items-start gap-x-3 p-[clamp(0.5rem,1.5vh,1rem)]">
                    <MapPin className="mt-0.5 h-[clamp(0.75rem,2vh,1.25rem)] w-[clamp(0.75rem,2vh,1.25rem)] shrink-0 text-red-600" />
                    <div className="flex flex-col">
                      <span className="text-[clamp(0.75rem,1.5vh,1rem)]">
                        {event.location}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Map */}
                <div className="flex min-h-0 flex-1 rounded-2xl">
                  <iframe
                    src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${event.location}`}
                    title="Class Location"
                    className="h-full w-full rounded-2xl"
                    allowFullScreen
                  ></iframe>
                </div>

                {/* Volunteer Section */}
                {event.jobs.length > 0 && (
                  <VolunteerSection locale={locale} eventKeyName={event.keyName} eventType={event.eventType} />
                )}
              </div>

              {/* Go to check out section button */}
              <ScrollToCheckoutButton text={t('goToCheckout')} />

              {/* Already paid */}
              {existingPayment && existingPayment.length > 0 && (
                <p className="text-[clamp(0.75rem,1.5vh,1rem)] font-medium text-green-600">
                  {t('alreadyPaid')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Payment Options */}
        <div id="checkout-section" className="w-full">
          <PaymentOptions
            formLink={event.formLink!}
            eventKeyName={event.keyName}
            eventId={event.id}
            title={event.title}
            userId={author}
            type={typeMap[event.eventType as keyof typeof typeMap]}
            loggedIn={author ? true : false}
            seatingMap={seatingMap}
            tickets={event.tickets}
            isCapacityExceeded={isCapacityExceeded}
            discounts={event.eventDiscounts}
          />
        </div>

        <EventVotingPanel
          eventId={event.id}
          locale={locale}
          isLoggedIn={Boolean(author)}
          userEmail={session?.user?.email}
        />

        {/* Sponsors */}
        {event.sponsors && event.sponsors.length > 0 && (
          <SponsorsList sponsors={event.sponsors} headerText={t('headerSponsors')} />
        )}

        {/* Schedule Section */}
        {event.schedules && event.schedules.length > 0 && (
          <div className="w-full space-y-6">
            <h2 className="text-2xl font-bold md:text-3xl lg:text-4xl">
              {t('headerSchedule')}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {event.schedules
                .sort((a, b) => (a.position || 0) - (b.position || 0))
                .map(
                  (schedule) =>
                    schedule.startTime &&
                    schedule.endTime &&
                    schedule.description && (
                      <div
                        key={schedule.id}
                        className="rounded-lg bg-[#D20C36] p-4 shadow-[0_0_15px_rgba(0,0,0,0.3)]"
                      >
                        <div className="mb-2 text-sm font-medium text-white/80">
                          {schedule.startTime} - {schedule.endTime}
                        </div>
                        <p className="text-white">{schedule.description}</p>
                      </div>
                    )
                )}
            </div>
          </div>
        )}

        {/* Gallery at bottom; carousel returns null when there is nothing to show */}
        <EventGalleryCarousel
          className="my-8"
          imageUrls={(event.imgUrls as string[]) ?? []}
          eventId={event.id}
          seriesId={seriesId}
        />
      </div>
    </div>
  )
}

export default ConcertDescriptions
