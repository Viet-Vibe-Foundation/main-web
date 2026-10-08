// Libraries
import { getCurrentUserInfo } from '@/lib/actions/user/getCurrentUserInfo'
import { prisma } from '@/lib/db'
import {
  getAllPublishedEvents,
  getAllEvents,
  getEventsOfHost,
  type EventWithHostsForAdmin,
} from '@/lib/actions/event/getEvent'
import { getAllEventCategories } from '@/lib/actions/event/getEventCategories'
import { getAllEventSeries } from '@/lib/actions/event/getEventSeries'
import { getEventForEditing } from '@/lib/actions/event/getEventById'
import { getAllJobs, getJobForEditing } from '@/lib/actions/job/getJob'
import { getAllPosts, getPostForEditing } from '@/lib/actions/post/getPosts'
import { getAllShops, getShopForEditing, getShopsOfShopOwner } from '@/lib/actions/shop/getShop'
import { getAllReceipts } from '@/lib/actions/receipt/getReceipt'

// Components
import MyProfile from './_components/MyProfile'
import UpdateProfileForm from './_components/UpdateProfileForm'
import PasswordForm from './_components/PasswordForm'
import DeleteForm from './_components/DeleteForm'
import SubscriptionInfo from './_components/SubscriptionInfo'
import PaymentManagement from './_components/PaymentManagement'
import PrivacyPolicy from '../_components/_policy/PrivacyPolicy'
import RefundPolicy from '../_components/_policy/RefundPolicy'
import EmailComposition from './_components/EmailComposition'
import TicketCheckIn from './_components/TicketCheckIn'
import EventManagement from '../events/(Admin)/allEvents/_components/EventManagement'
import CreateEventForm from './_components/CreateEventForm'
import EventCategoryManager from './_components/EventCategoryManager'
import EventSeriesManager from './_components/EventSeriesManager'
import SponsorsManagement from './_components/SponsorsManagement'
import EditEvent from '../events/(Admin)/editEvent/[eventKeyName]/_components/EditEvent'
import EventStatistics from './_components/EventStatistics'
import ShopStatistics from './_components/ShopStatistics'
import VVFFinance from './_components/VVFFinance'
import CreateJobForm from './_components/CreateJobForm'
import EditJob from '../registration/_components/_jobs/_editJob/EditJob'
import JobManagement from '../registration/_components/_jobs/_allJob/JobManagement'
import PostManagement from '../posts/(Admin)/allPosts/_components/PostManagement'
import CreatePostForm from './_components/CreatePostForm'
import EditPost from '../posts/(Admin)/editPost/_components/EditPost'
import ShopManagement from '../shop/(Admin)/allShops/_components/ShopManagement'
import CreateShopForm from './_components/CreateShopForm'
import EditShop from '../shop/(Admin)/editShop/[shopId]/_components/EditShop'
import { ShopWithEvent } from '../shop/(Admin)/allShops/_components/columns'

// Helper to fetch payment history (no cache because it's based on user id)
const getPaymentHistory = (userId: string) =>
  prisma.payment.findMany({
    where: { userId },
    select: {
      id: true,
      pricePaid: true,
      createdAt: true,
      expiresAt: true,
      type: true,
      quantity: true,
      refunded: true,
      seatNumber: true,
      event: {
        select: {
          id: true,
          title: true,
          keyName: true,
          imgUrl: true,
          startDate: true,
          endDate: true,
          location: true,
        },
      },
      shop: {
        select: {
          title: true,
          slug: true,
        },
      },
      shopItem: {
        select: {
          title: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

// Helper to fetch published events
const getPublishedEvents = async () => {
  return await getAllPublishedEvents({
    id: true,
    title: true,
    keyName: true,
    eventType: true,
    startDate: true,
    endDate: true,
    location: true,
    imgUrl: true,
  })
}

// Main Component
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{
    section?: string
    page?: string
    pageSize?: string
    paymentSearch?: string
    paymentTypeTab?: 'all' | 'incoming' | 'refund'
    eventKeyName?: string
    jobId?: string
    postId?: string
    shopId?: string
  }>
}) {
  const [
    { section, page: pageStr, pageSize: pageSizeStr, paymentSearch, paymentTypeTab, eventKeyName, jobId, postId, shopId },
    { locale },
    user,
  ] = await Promise.all([searchParams, params, getCurrentUserInfo()])

  const isSuperAdmin = user?.role?.includes('SUPERADMIN')
  const isAdmin = user?.role?.includes('ADMIN')
  const isHost = user?.role?.includes('HOST')
  const isWriter = user?.role?.includes('WRITER')
  const isShopOwner = user?.role?.includes('SHOPOWNER')

  // Return if user is not logged in
  if (!user) {
    return <p className="mt-10 text-center">No user data available.</p>
  }

  // Switch component based on searchParams
  // Only fetch data that's needed for each section
  switch (section) {
    case 'update-profile':
      return <UpdateProfileForm user={user} />

    case 'change-password':
      return <PasswordForm user={user} />

    case 'delete-account':
      return <DeleteForm user={user} />

    case 'subscription': {
      const paymentHistory = await getPaymentHistory(user.id)
      return <SubscriptionInfo paymentHistory={paymentHistory} user={user} />
    }

    case 'admin-payment-management':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        const page = Math.max(1, Number.parseInt(pageStr || '1', 10) || 1)
        const pageSize = [5, 10, 20, 50].includes(Number(pageSizeStr))
          ? Number(pageSizeStr)
          : 5
        return (
          <PaymentManagement
            user={user}
            page={page}
            pageSize={pageSize}
            dbSearch={paymentSearch || ''}
            paymentTypeTab={paymentTypeTab || 'all'}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-email-composition':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        return <EmailComposition user={user} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-ticket-checkin':
      if (isSuperAdmin || isAdmin || isHost) {
        return <TicketCheckIn user={user} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'privacy-policy':
      return (
        <div>
          <PrivacyPolicy locale={locale} />
        </div>
      )

    case 'refund-policy':
      return (
        <div>
          <RefundPolicy locale={locale} />
        </div>
      )

    case 'admin-all-events':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        let allEvents: EventWithHostsForAdmin[] = []
        if (user.role.includes('HOST')) {
          allEvents = await getEventsOfHost(user.id)
        } else {
          allEvents = await getAllEvents()
        }
        return (
          <EventManagement
            allEvents={allEvents}
            createEventLink={`/${locale}/profile?section=admin-create-event`}
            editLinkPattern={`/${locale}/profile?section=admin-edit-event&eventKeyName={keyName}`}
            showBackButton={false}
            userRole={user.role}
            userId={user.id}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-create-event':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        return <CreateEventForm locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-event-categories':
      if (isSuperAdmin || isAdmin) {
        return <EventCategoryManager user={user} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-event-series':
      if (isSuperAdmin || isAdmin) {
        return <EventSeriesManager user={user} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-manage-sponsors':
      if (isSuperAdmin || isAdmin) {
        return <SponsorsManagement user={user} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-event-statistics':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        return <EventStatistics user={user} locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-shop-statistics':
      if (
        isSuperAdmin || isAdmin || isShopOwner
      ) {
        return <ShopStatistics user={user} locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-vvf-finance':
      if (
        isSuperAdmin || isAdmin || isShopOwner
      ) {
        const receipts = await getAllReceipts(Boolean(isSuperAdmin || isAdmin), user.id)
        return <VVFFinance receipts={receipts} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-edit-event':
      if (
        isSuperAdmin || isAdmin || isHost
      ) {
        if (!eventKeyName) {
          return (
            <p className="mt-10 text-center">
              Event Key Name is required to edit an event.
            </p>
          )
        }

        // Fetch event data, categories, and series in parallel
        const [event, categories, allSeries] = await Promise.all([
          getEventForEditing(eventKeyName),
          getAllEventCategories(),
          getAllEventSeries(),
        ])

        if (!event) {
          return (
            <p className="mt-10 text-center">
              Event not found.
            </p>
          )
        }

        return (
          <EditEvent
            event={event}
            categories={categories}
            allSeries={allSeries}
            isSuperAdmin={Boolean(isSuperAdmin)}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-create-job':
      if (isSuperAdmin || isAdmin) {
        return <CreateJobForm user={user} locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-all-jobs':
      if (isSuperAdmin || isAdmin) {
        const allJobs = await getAllJobs()
        return (
          <JobManagement
            allJobs={allJobs}
            createJobLink={`/${locale}/profile?section=admin-create-job`}
            editLinkPattern={`/${locale}/profile?section=admin-edit-job&jobId={keyName}`}
            showBackButton={false}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-edit-job':
      if (isSuperAdmin || isAdmin) {
        if (!jobId) {
          return (
            <p className="mt-10 text-center">
              Job ID is required to edit a job.
            </p>
          )
        }

        // Fetch job data
        const job = await getJobForEditing(jobId)

        if (!job) {
          return (
            <p className="mt-10 text-center">
              Job not found.
            </p>
          )
        }

        return (
          <EditJob
            job={job}
            isSuperAdmin={Boolean(isSuperAdmin)}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-all-posts':
      if (isSuperAdmin || isAdmin || isWriter) {
        const allPosts = await getAllPosts()
        return (
          <PostManagement
            allPosts={allPosts}
            createPostLink={`/${locale}/profile?section=admin-create-post`}
            editLinkPattern={`/${locale}/profile?section=admin-edit-post&postId={id}`}
            showBackButton={false}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-create-post':
      if (isSuperAdmin || isAdmin || isWriter) {
        return <CreatePostForm user={user} locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-edit-post':
      if (isSuperAdmin || isAdmin || isWriter) {
        if (!postId) {
          return (
            <p className="mt-10 text-center">
              Post ID is required to edit a post.
            </p>
          )
        }

        // Fetch post data
        const post = await getPostForEditing(postId)

        if (!post) {
          return (
            <p className="mt-10 text-center">
              Post not found.
            </p>
          )
        }

        return (
          <EditPost
            post={post}
            showBackButton={false}
            isSuperAdmin={Boolean(isSuperAdmin)}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-create-shop':
      if (isSuperAdmin || isAdmin || isShopOwner) {
        return <CreateShopForm ownerId={user.id} locale={locale} />
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-all-shops':
      if (isSuperAdmin || isAdmin || isShopOwner) {
        let allShops: ShopWithEvent[] = []
        if (user.role.includes('SHOPOWNER')) {
          allShops = await getShopsOfShopOwner(user.id)
        } else {
          allShops = await getAllShops()
        }
        return (
          <ShopManagement
            allShops={allShops}
            createShopLink={`/${locale}/profile?section=admin-create-shop`}
            editLinkPattern={`/${locale}/profile?section=admin-edit-shop&shopId={shopId}`}
            showBackButton={false}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    case 'admin-edit-shop':
      if (isSuperAdmin || isAdmin || isHost || isShopOwner) {
        if (!shopId) {
          return (
            <p className="mt-10 text-center">
              Shop ID is required to edit a shop.
            </p>
          )
        }

        // Fetch shop data
        const shop = await getShopForEditing(shopId)

        if (!shop) {
          return (
            <p className="mt-10 text-center">
              Shop not found.
            </p>
          )
        }

        return (
          <EditShop
            shop={shop}
            showBackButton={false}
          />
        )
      }
      return (
        <p className="mt-10 text-center">
          You do not have permission to view this page.
        </p>
      )

    default: {
      // Only fetch events and payment history for the default profile view
      const [eventList, paymentHistory] = await Promise.all([
        getPublishedEvents(),
        getPaymentHistory(user.id),
      ])
      return (
        <MyProfile
          user={user}
          locale={locale}
          upcoming_events={eventList}
          paymentHistory={paymentHistory}
        />
      )
    }
  }
}
