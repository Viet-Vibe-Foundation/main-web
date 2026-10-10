'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { EventCategory, EventSeries } from '@prisma/client'
import { EventForEditing } from '@/lib/actions/event/getEventById'
import { cn } from '@/lib/utils'

import PublishButton from '@/components/ui/PublishButton'
import BackButton from '@/components/ui/back-button'
import { Button } from '@/components/ui/button'
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
import EventVoteTool from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EventVoteTool'
import EditEventSection, {
  type EditEventSectionMeta,
} from '@/app/[locale]/(Home)/events/(Admin)/editEvent/[eventKeyName]/_components/EditEventSection'

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
    event.tickets.length === 0 ? false : true,
    event.hosts.length === 0 ? false : true,
    event.days.length === 0 ? false : true,
    event.schedules.length === 0 ? false : true,
    event.categories.length === 0 ? false : true,
  ]

  const completedFields = eventFields.filter(Boolean).length
  const completionText = `(${completedFields} / ${eventFields.length})`
  const canPublish = completedFields === eventFields.length

  const defaultCategoriesLink = `/profile?section=admin-event-categories`
  const defaultSeriesLink = `/profile?section=admin-event-series`
  const defaultSponsorsLink = `/profile?section=admin-manage-sponsors`

  const sections: EditEventSectionMeta[] = useMemo(
    () => [
      { id: 'title', step: 'I', label: 'Title', complete: !!event.title },
      { id: 'type', step: 'II', label: 'Type', complete: !!event.eventType },
      {
        id: 'description',
        step: 'III',
        label: 'Description',
        complete: !!event.description,
      },
      {
        id: 'capacity',
        step: 'IV',
        label: 'Capacity',
        complete: !!event.capacity,
      },
      {
        id: 'tickets',
        step: 'V',
        label: 'Tickets',
        complete: event.tickets.length > 0,
      },
      {
        id: 'discounts',
        step: 'V.5',
        label: 'Discounts',
        optional: true,
      },
      {
        id: 'location',
        step: 'VI',
        label: 'Location',
        complete: !!event.location,
      },
      {
        id: 'categories',
        step: 'VII',
        label: 'Event Categories',
        complete: event.categories.length > 0,
      },
      { id: 'image', step: 'VIII', label: 'Image', complete: !!event.imgUrl },
      {
        id: 'start-date',
        step: 'IX',
        label: 'Start Date',
        complete: !!event.startDate,
      },
      {
        id: 'end-date',
        step: 'X',
        label: 'End Date',
        complete: !!event.endDate,
      },
      {
        id: 'timings',
        step: 'XI',
        label: 'Event Timings',
        complete: !!event.startTime && !!event.endTime,
      },
      {
        id: 'days',
        step: 'XII',
        label: 'Event Days',
        complete: event.days.length > 0,
      },
      {
        id: 'schedule',
        step: 'XIII',
        label: 'Event Schedule',
        complete: event.schedules.length > 0,
      },
      {
        id: 'hosts',
        step: 'XIV',
        label: 'Event Hosts',
        complete: event.hosts.length > 0,
      },
      { id: 'series', step: 'XVI', label: 'Event Series', optional: true },
      {
        id: 'registration-form',
        step: 'XVII',
        label: 'Registration Form Link',
        optional: true,
      },
      {
        id: 'social-media',
        step: 'XVIII',
        label: 'Social Media Links',
        optional: true,
      },
      { id: 'gallery', step: 'XIX', label: 'Event Gallery', optional: true },
      { id: 'seating', step: 'XX', label: 'Event Seating', optional: true },
      {
        id: 'sponsors',
        step: 'XXI',
        label: 'Sponsors / Partners',
        optional: true,
      },
      { id: 'event-form', step: 'XXII', label: 'Event Form', optional: true },
      {
        id: 'confirmation-email',
        step: 'XXIII',
        label: 'Ticket Confirmation Email',
        optional: true,
      },
      {
        id: 'vote-tool',
        step: 'XXIV',
        label: 'Voting Tool',
        optional: true,
      },
    ],
    [event]
  )

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  const isOpen = useCallback(
    (id: string) => Boolean(openSections[id]),
    [openSections]
  )

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
    setActiveSectionId(id)
  }, [])

  const openAndScrollTo = useCallback((id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: true }))
    setActiveSectionId(id)
    requestAnimationFrame(() => {
      document
        .getElementById(`edit-event-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const expandAll = () => {
    const next: Record<string, boolean> = {}
    sections.forEach((s) => {
      next[s.id] = true
    })
    setOpenSections(next)
  }

  const collapseAll = () => setOpenSections({})

  return (
    <div className="my-8 p-4 md:my-12 md:p-6 lg:my-16">
      {showBackButton && <BackButton />}
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-y-2">
            <h1 className="text-2xl font-bold tracking-wide md:text-3xl xl:text-4xl">
              Edit Event
            </h1>
            <span className="text-sm text-muted-foreground">
              Sections are collapsed by default — expand only what you need.
              Complete the first 14 required steps to publish.
            </span>
            <span className="text-sm text-muted-foreground">
              Required steps completed: {completionText}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={collapseAll}
          >
            Collapse all
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          {/* Table of contents */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <nav
              aria-label="Edit event sections"
              className="rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Contents
              </p>
              <ul className="max-h-[70vh] space-y-0.5 overflow-y-auto pr-1">
                {sections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => openAndScrollTo(section.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white',
                        activeSectionId === section.id &&
                          'bg-white font-medium shadow-sm'
                      )}
                    >
                      <span className="w-8 shrink-0 text-xs text-slate-400">
                        {section.step}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {section.label}
                      </span>
                      {typeof section.complete === 'boolean' && (
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            section.complete ? 'bg-green-500' : 'bg-amber-400'
                          )}
                          title={section.complete ? 'Done' : 'Needed'}
                        />
                      )}
                      {section.optional &&
                        typeof section.complete !== 'boolean' && (
                          <span className="text-[10px] text-slate-400">opt</span>
                        )}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Collapsible sections */}
          <div className="flex min-w-0 flex-col gap-3">
            <EditEventSection
              meta={sections[0]!}
              isOpen={isOpen('title')}
              onToggle={() => toggleSection('title')}
            >
              <EventTitle event={event} />
              {event.eventType === 'CONCERT' && (
                <EventSubtitle event={event} />
              )}
            </EditEventSection>

            <EditEventSection
              meta={sections[1]!}
              isOpen={isOpen('type')}
              onToggle={() => toggleSection('type')}
            >
              <EventType event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[2]!}
              isOpen={isOpen('description')}
              onToggle={() => toggleSection('description')}
            >
              <EditorInstructions />
              <EventDescription event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[3]!}
              isOpen={isOpen('capacity')}
              onToggle={() => toggleSection('capacity')}
            >
              <EventCapacity event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[4]!}
              isOpen={isOpen('tickets')}
              onToggle={() => toggleSection('tickets')}
            >
              <EventTickets event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[5]!}
              isOpen={isOpen('discounts')}
              onToggle={() => toggleSection('discounts')}
            >
              <EventDiscounts event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[6]!}
              isOpen={isOpen('location')}
              onToggle={() => toggleSection('location')}
              description={
                <p className="text-sm text-muted-foreground">
                  NOTE: Do not use special characters such as &quot; or &apos;
                  or &amp;. Comma can be used.
                </p>
              }
            >
              <EventLocation event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[7]!}
              isOpen={isOpen('categories')}
              onToggle={() => toggleSection('categories')}
              description={
                <p className="text-sm text-muted-foreground">
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
              }
            >
              <EventCategories event={event} categories={categories} />
            </EditEventSection>

            <EditEventSection
              meta={sections[8]!}
              isOpen={isOpen('image')}
              onToggle={() => toggleSection('image')}
            >
              <ImageAddInstruction />
              <EventImage event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[9]!}
              isOpen={isOpen('start-date')}
              onToggle={() => toggleSection('start-date')}
            >
              <EventStartDate event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[10]!}
              isOpen={isOpen('end-date')}
              onToggle={() => toggleSection('end-date')}
            >
              <EventEndDate event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[11]!}
              isOpen={isOpen('timings')}
              onToggle={() => toggleSection('timings')}
            >
              <EventTimings event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[12]!}
              isOpen={isOpen('days')}
              onToggle={() => toggleSection('days')}
            >
              <EventDays event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[13]!}
              isOpen={isOpen('schedule')}
              onToggle={() => toggleSection('schedule')}
            >
              <EventSchedule event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[14]!}
              isOpen={isOpen('hosts')}
              onToggle={() => toggleSection('hosts')}
            >
              <EventHosts event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[15]!}
              isOpen={isOpen('series')}
              onToggle={() => toggleSection('series')}
              description={
                <p className="text-sm text-muted-foreground">
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
              }
            >
              <EventEditSeries event={event} allSeries={allSeries} />
            </EditEventSection>

            <EditEventSection
              meta={sections[16]!}
              isOpen={isOpen('registration-form')}
              onToggle={() => toggleSection('registration-form')}
              description={
                <p className="text-sm text-muted-foreground">
                  Please note that if you use your own registration form, the
                  Stripe payment section will be replaced. Make sure to include
                  your own payment options in the form (E-transfer option will
                  still be available). *NOTE*: ZEFFY form link can also be used
                  here
                </p>
              }
            >
              <EventFormLink event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[17]!}
              isOpen={isOpen('social-media')}
              onToggle={() => toggleSection('social-media')}
            >
              <EventSocialMedia event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[18]!}
              isOpen={isOpen('gallery')}
              onToggle={() => toggleSection('gallery')}
            >
              <EventGallery event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[19]!}
              isOpen={isOpen('seating')}
              onToggle={() => toggleSection('seating')}
              description={
                <p className="text-sm text-muted-foreground">
                  Please note that this will add a seating map to your event.
                </p>
              }
            >
              <EventSeating event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[20]!}
              isOpen={isOpen('sponsors')}
              onToggle={() => toggleSection('sponsors')}
              description={
                <p className="text-sm text-muted-foreground">
                  Please use this link to manage sponsors/partners:{' '}
                  <Link
                    href={sponsorsLink || defaultSponsorsLink}
                    target="_blank"
                    className="text-textColor-blue underline"
                  >
                    here
                  </Link>
                </p>
              }
            >
              <p className="text-sm text-muted-foreground">
                Sponsors are managed on the sponsors page linked above.
              </p>
            </EditEventSection>

            <EditEventSection
              meta={sections[21]!}
              isOpen={isOpen('event-form')}
              onToggle={() => toggleSection('event-form')}
            >
              <EventForm event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[22]!}
              isOpen={isOpen('confirmation-email')}
              onToggle={() => toggleSection('confirmation-email')}
              description={
                <p className="text-sm text-muted-foreground">
                  Customize the email guests receive after purchasing a ticket.
                  Insert auto-filled fields with tokens like{' '}
                  <code>&lt;&lt;firstName&gt;&gt;</code>,{' '}
                  <code>&lt;&lt;ticketType&gt;&gt;</code>, or{' '}
                  <code>&lt;&lt;qrCodes&gt;&gt;</code>.
                </p>
              }
            >
              <EventConfirmationEmail event={event} />
            </EditEventSection>

            <EditEventSection
              meta={sections[23]!}
              isOpen={isOpen('vote-tool')}
              onToggle={() => toggleSection('vote-tool')}
              description={
                <p className="text-sm text-muted-foreground">
                  Special tool: add a public vote on the event page. Visitors can
                  vote once per device / account, optionally change their vote,
                  and results are shown publicly.
                </p>
              }
            >
              <EventVoteTool event={event} />
            </EditEventSection>
          </div>
        </div>
      </div>
    </div>
  )
}
