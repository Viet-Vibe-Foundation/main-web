// Components
import ClassImage from '../_component/_class/ClassImage'
import ClassDescription from '../_component/_class/ClassDescription'
import BackButton from '@/components/ui/back-button'
import ConcertDescriptions from '../_component/_concert/ConcertDescriptions'
import ConcertHeaders from '../_component/_concert/ConcertHeaders'
import NotFound from '../../../not-found'

// Types
import { SeatingMap } from '../../(Admin)/editEvent/[eventKeyName]/_components/EventSeating'

// Libraries
import { Metadata } from 'next'
import { getEventByKeyName } from '@/lib/actions/event/getEventById'
import { normalizeReferralCode } from '@/lib/actions/referral/referralCode'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventKeyName: string }>
}): Promise<Metadata> {
  const { eventKeyName } = await params
  const publishedClass = await getEventByKeyName(eventKeyName)

  return {
    title: publishedClass?.title,
    description: 'Make reservations for ' + publishedClass?.title + ' from Viet Vibe Foundation to secure your spot today',
    openGraph: {
      title: publishedClass?.title,
      description: 'Make reservations for ' + publishedClass?.title + ' from Viet Vibe Foundation to secure your spot today',
      images: {
        url: publishedClass?.imgUrl!,
        alt: publishedClass?.title,
      },
    },
  }
}

// Interfaces
interface ClassPageProps {
  params: Promise<{ locale: string; eventKeyName: string }>
  searchParams: Promise<{ ref?: string }>
}

// Main Component
const ClassPage = async ({ params, searchParams }: ClassPageProps) => {
  const { locale, eventKeyName } = await params
  const { ref } = await searchParams
  const referralCode = normalizeReferralCode(ref)

  const publishedClass = await getEventByKeyName(eventKeyName)

  if (!publishedClass) {
    return <NotFound />
  }

  return (
    <>
      {publishedClass.eventType === 'CONCERT' ? (
        <div className="w-full">
          {/* Event Headers */}
          <ConcertHeaders event={publishedClass} />
          <ConcertDescriptions
            event={{
              ...publishedClass,
              imgUrls: (publishedClass.imgUrls as string[]) || [],
            }}
            locale={locale}
            reviewsCount={publishedClass._count.Review}
            seriesId={publishedClass.series?.id}
            seatingMap={publishedClass.seatingMap as SeatingMap}
            referralCode={referralCode}
          />
        </div>
      ) : (
        <div>
          <div className="width-max-default relative mx-auto pt-[90px] md:pt-[120px]">
            <BackButton variant={'default'} className="top-[30px]" />
            <ClassImage
              eventId={publishedClass.id}
              hosts={publishedClass.hosts}
              title={publishedClass.title}
              locale={locale}
              socialLinks={
                publishedClass.socialLinks as
                  | { platform: string; url: string }[]
                  | null
              }
              reviewsCount={publishedClass._count.Review}
              seriesId={publishedClass.series?.id}
            />
          </div>
          <ClassDescription
            description={publishedClass.description!}
            imageUrl={publishedClass.imgUrl!}
            startDate={publishedClass.startDate!}
            endDate={publishedClass.endDate}
            startTime={publishedClass.startTime!}
            endTime={publishedClass.endTime!}
            capacity={publishedClass.capacity!}
            location={publishedClass.location!}
            hosts={publishedClass.hosts}
            schedules={publishedClass.schedules}
            days={publishedClass.days!}
            formLink={publishedClass.formLink!}
            locale={locale}
            keyName={publishedClass.keyName}
            classId={publishedClass.id}
            title={publishedClass.title}
            eventType={publishedClass.eventType}
            imageUrls={(publishedClass.imgUrls as string[]) ?? []}
            tickets={publishedClass.tickets}
            sponsors={publishedClass.sponsors}
            linkedJobs={publishedClass.jobs}
            discounts={publishedClass.eventDiscounts}
            seriesId={publishedClass.series?.id}
            referralCode={referralCode}
          />
        </div>
      )}
    </>
  )
}

export default ClassPage
