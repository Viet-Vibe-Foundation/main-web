// Libraries
import Link from 'next/link'
import { EventCategory, EventSeries } from '@prisma/client'
import { EventForEditing } from '@/lib/actions/event/getEventById'

// Components
import PublishButton from '@/components/ui/PublishButton'
import BackButton from '@/components/ui/back-button'
import EventStartDate from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventStartDate'
import EventTitle from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventTitle'
import EventEndDate from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventEndDate'
import EventTimings from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventTimings'
import EventSchedule from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventSchedule'
import EventCategories from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventCategories'
import EventDays from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventDays'
import EventImage from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventImage'
import EventTickets from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventTicket'
import EventDiscounts from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventDiscount'
import EventLocation from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventLocation'
import EventType from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventType'
import EventHosts from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventHosts'
import EventDescription from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventDescription'
import EventCapacity from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventCapacity'
import EventEditSeries from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventSeries'
import ImageAddInstruction from '@/components/instruction/ImageAddInstruction'
import EditorInstructions from '@/components/instruction/EditorInstructions'
import EventFormLink from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventFormLink'
import EventSocialMedia from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventSocialMedia'
import EventSubtitle from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventSubtitle'
import EventGallery from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventGallery'
import DeleteEventButton from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/DeleteEventButton'
import EventSeating from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventSeating'
import EventForm from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventForm'
import EventConfirmationEmail from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventConfirmationEmail'

interface EditEventProps {
  event: EventForEditing
  categories: EventCategory[]
  allSeries: EventSeries[]
  isSuperAdmin?: boolean
  showBackButton?: boolean
  categoriesLink?: string
  seriesLink?: string
  sponsorsLink?: string
}

export default function EditEvent({
  event,
  categories,
  allSeries,
  isSuperAdmin = false,
  showBackButton = false,
  categoriesLink,
  seriesLink,
  sponsorsLink,
}: EditEventProps) {

  const eventFields = [
    !!event.title,
    !!event.eventType,
    !!event.description,
    !!event.capacity,

    !!event.location,
    !!event.imgUrl,
    !!event.startTime && !!event.endTime,
    !!event.startDate,
    !!event.endDate,
    // !!event.formLink,
    event.tickets.length === 0 ? false : true,
    event.hosts.length === 0 ? false : true,
    event.days.length === 0 ? false : true,
    event.schedules.length === 0 ? false : true,
    event.categories.length === 0 ? false : true,
  ]

  const completedFields = eventFields.filter(Boolean).length
  const completionText = `(${completedFields} / ${eventFields.length})`
  const canPublish = completedFields === eventFields.length

  // Default links
  const defaultCategoriesLink = `/profile?section=admin-event-categories`
  const defaultSeriesLink = `/profile?section=admin-event-series`
  const defaultSponsorsLink = `/profile?section=admin-manage-sponsors`

  return (
    <div className="my-12 p-6 lg:my-20">
      {showBackButton && <BackButton />}
      <div className="mx-auto my-20 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-y-3">
            <h1 className="text-2xl font-bold tracking-wide md:text-3xl xl:text-5xl">
              Edit Event
            </h1>
            <span className="text-sm text-muted-foreground">
              Fill all the fields to publish your event.
            </span>
            <span className="mt-1 text-sm text-muted-foreground">
              Please complete the first 14 steps, the rest are optional.
            </span>
            <span className="mt-1 text-sm text-muted-foreground">
              Required steps completed: {completionText}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex-col-center gap-x-4 gap-y-4 md:flex-row">
            <DeleteEventButton
              eventId={event.id}
              isSuperAdmin={isSuperAdmin}
            />
            <PublishButton
              id={event.id}
              type={'event'}
              canPublish={canPublish}
              isPublished={event.isPublished}
              domain={'events'}
            />
          </div>
        </div>

        {/* Event Body */}
        <div className="mt-20 grid grid-cols-1 gap-x-4 gap-y-12 md:grid-cols-2 lg:gap-x-8">
          {/* Title */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step I :</span> Title
            </h2>
            <EventTitle event={event} />
            {event.eventType === 'CONCERT' && <EventSubtitle event={event} />}
          </div>

          {/* Type */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step II :</span> Type
            </h2>
            <EventType event={event} />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step III :</span> Description
            </h2>
            <EditorInstructions />
            <EventDescription event={event} />
          </div>

          {/* Capacity */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step IV :</span> Capacity
            </h2>
            <EventCapacity event={event} />
          </div>

          {/* Tickets */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step V :</span> Tickets
            </h2>
            <EventTickets event={event} />
          </div>

          {/* Discounts */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step V.5 :</span> Discounts (Optional)
            </h2>
            <EventDiscounts event={event} />
          </div>

          {/* Location */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step VI :</span> Location
            </h2>
            <p>
              NOTE: Do not use special characters such as &quot; or &apos; or
              &amp;. Comma can be used.
            </p>
            <EventLocation event={event} />
          </div>

          {/* Event Categories */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XII :</span> Event Categories
            </h2>
            <p>
              {' '}
              To add categories, please click{' '}
              <Link
                href={categoriesLink || defaultCategoriesLink}
                target="_blank"
                className="text-textColor-blue underline"
              >
                here
              </Link>
              . After adding, please refresh the page.
            </p>
            <EventCategories event={event} categories={categories} />
          </div>

          {/* Images */}
          <div className="col-span-full flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step VIII :</span> Image
            </h2>
            <ImageAddInstruction />
            <EventImage event={event} />
          </div>

          {/* Start Date */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step IX :</span> Start Date
            </h2>
            <EventStartDate event={event} />
          </div>

          {/* End date */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step X :</span> End Date
            </h2>
            <EventEndDate event={event} />
          </div>

          {/* Event Timings */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XI :</span> Event Timings
            </h2>
            <EventTimings event={event} />
          </div>

          {/* Event Days */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XII :</span> Event Days
            </h2>
            <EventDays event={event} />
          </div>

          {/* End Schedule */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XIII :</span> Event Schedule
            </h2>
            <EventSchedule event={event} />
          </div>

          {/* Event Hosts */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XIV :</span> Event Hosts
            </h2>
            <EventHosts event={event} />
          </div>

          {/* Event Series */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XVI :</span> Event Series (Optional)
            </h2>
            <p>
              If you don&apos;t see any series, you can create one{' '}
              <Link
                href={seriesLink || defaultSeriesLink}
                target="_blank"
                className="text-textColor-blue underline"
              >
                here
              </Link>
              . After adding, please refresh the page.
            </p>
            <EventEditSeries event={event} allSeries={allSeries} />
          </div>

          {/* Event Registration Form Link */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XVII :</span> Event
              Registration Form (Optional)
            </h2>
            <p>
              Please note that if you use your own registration form, the Stripe
              payment section will be replaced. Make sure to include your own
              payment options in the form (E-transfer option will still be
              available). *NOTE*: ZEFFY form link can also be used here
            </p>
            <EventFormLink event={event} />
          </div>

          {/* Event Social Media - Only show for concert events */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XVIII :</span> Social Media
              Links (Optional)
            </h2>
            <EventSocialMedia event={event} />
          </div>

          {/* Event Gallery */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XIX :</span> Event Gallery
              (Optional)
            </h2>
            <EventGallery event={event} />
          </div>

          {/* Event Seating */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XX :</span> Event Seating
              (Optional)
            </h2>
            <p>
              Please note that this will add a seating map to your event.
            </p>
            <EventSeating event={event} />
          </div>

          {/* Event Sponsors */}
          <div className="flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XXI :</span> Event Sponsors/Partners
              (Optional)
            </h2>
            <p>
              Please use this link to manage sponsors/partners:{' '}
              <Link
                href={sponsorsLink || defaultSponsorsLink}
                target="_blank"
                className="text-textColor-blue underline"
              >
                here
              </Link>
            </p>
          </div>

          {/* Event Form */}
          <div className="col-span-full flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XXII :</span> Event Form (Optional)
            </h2>
            <EventForm event={event} />
          </div>

          {/* Ticket confirmation email */}
          <div className="col-span-full flex flex-col gap-y-8">
            <h2 className="text-xl font-bold md:text-2xl xl:text-3xl">
              <span className="text-gray-500">Step XXIII :</span> Ticket
              Confirmation Email (Optional)
            </h2>
            <p>
              Customize the email guests receive after purchasing a ticket.
              Insert auto-filled fields with tokens like{' '}
              <code>&lt;&lt;firstName&gt;&gt;</code>,{' '}
              <code>&lt;&lt;ticketType&gt;&gt;</code>, or{' '}
              <code>&lt;&lt;qrCodes&gt;&gt;</code>.
            </p>
            <EventConfirmationEmail event={event} />
          </div>
        </div>
      </div>
    </div>
  )
}

