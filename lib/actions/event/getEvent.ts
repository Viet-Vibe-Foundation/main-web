'use server'

import { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { withDbRetry } from '@/lib/db/withDbRetry'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'

/** All events row for admin list (`getAllEvents`) */
export type EventWithHostsForAdmin = Prisma.EventGetPayload<{
  include: { hosts: true }
}>

// Cached version of getAllPublishedEvents with revalidateTag support
// Default: returns minimal fields (id, title) for backward compatibility
export const getAllPublishedEvents = unstable_cache(
  async (selectFields?: Prisma.EventSelect) => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(
      () =>
        prisma.event.findMany({
          where: {
            isPublished: true,
          },
          select: selectFields || {
            id: true,
            title: true,
            keyName: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
      { label: 'getAllPublishedEvents' }
    )
  },
  ['events-published-all-v2'], // Cache key prefix (v2: include keyName)
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)

// Cached version to get all published events with relations (categories, tickets)
export const getAllPublishedEventsWithRelations = unstable_cache(
  async () => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(
      () =>
        prisma.event.findMany({
          where: {
            isPublished: true,
          },
          orderBy: {
            endDate: 'desc',
          },
          include: {
            categories: true,
            tickets: true,
          },
        }),
      { label: 'getAllPublishedEventsWithRelations' }
    )
  },
  ['events-published-with-relations'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)

// Cached version with revalidateTag support
export const getPublishedEventsWithFilters = unstable_cache(
  async ({
    numberOfEvents,
    upcoming,
    finished,
    orderByField,
    orderDirection,
    includeCategories,
    selectFields,
  }: {
    numberOfEvents: number
    upcoming: boolean
    finished: boolean
    orderByField?: string
    orderDirection?: 'asc' | 'desc'
    includeCategories?: boolean
    selectFields?: Prisma.EventSelect
  }) => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(async () => {
      const baseQuery = {
        where: {
          isPublished: true,
          ...(upcoming && {
            endDate: {
              gte: new Date(),
            },
          }),
          ...(finished && {
            endDate: {
              lt: new Date(),
            },
          }),
        },
        orderBy: {
          [orderByField || 'endDate']: orderDirection || 'desc',
        },
        take: numberOfEvents ? numberOfEvents : undefined,
      }

      return selectFields
        ? prisma.event.findMany({
            ...baseQuery,
            select: {
              ...selectFields,
              categories: includeCategories ? true : false,
            },
          })
        : prisma.event.findMany({
            ...baseQuery,
            include: {
              categories: includeCategories ? true : false,
              tickets: true,
            },
          })
    }, { label: 'getPublishedEventsWithFilters' })
  },
  ['events-published-filtered'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)

// Cached version to get the closest future event
export const getClosestFutureEvent = unstable_cache(
  async () => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(async () => {
      const now = new Date()

      return prisma.event.findFirst({
        where: {
          isPublished: true,
          startDate: {
            gte: now, // Events that start in the future
          },
        },
        select: {
          id: true,
          title: true,
          keyName: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          eventType: true,
        },
        orderBy: {
          startDate: 'asc', // Get the closest one first
        },
      })
    }, { label: 'getClosestFutureEvent' })
  },
  ['events-closest-future'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)


// Get all events (published and unpublished) - for admin use only
// Cached with revalidateTag support - cache is invalidated when events are created/updated/deleted
export const getAllEvents = unstable_cache(
  async (): Promise<EventWithHostsForAdmin[]> => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(
      () =>
        prisma.event.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            hosts: true,
          },
        }),
      { label: 'getAllEvents' }
    )
  },
  ['events-all'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)

// Get event title by keyName - lightweight cached function for minimal data needs
export const getEventTitleByKeyName = unstable_cache(
  async (eventKeyName: string) => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(
      () =>
        prisma.event.findUnique({
          where: { keyName: eventKeyName },
          select: { title: true },
        }),
      { label: 'getEventTitleByKeyName' }
    )
  },
  ['event-title-by-keyname'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events'], // Tag for revalidation
  }
)

/**
 * Resolve an event's keyName by id (used by Event Manager → Manage Event).
 * Only admins, or hosts of that event, may resolve it.
 */
export async function getEventKeyNameById(
  eventId: string
): Promise<string | null> {
  const { prisma } = await import('@/lib/db')
  try {
    if (!(await canAccessEventPaymentData(eventId))) {
      return null
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { keyName: true },
    })
    return event?.keyName ?? null
  } catch (error) {
    console.error('Error getting event keyName by id:', error)
    return null
  }
}

export async function getEventsOfHost(
  userId: string,
): Promise<EventWithHostsForAdmin[]> {
  const { prisma } = await import('@/lib/db')
  try {
    return await prisma.event.findMany({
      where: {
        hosts: {
          some: {
            id: userId,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        hosts: true,
      },
    })
  } catch (error) {
    console.error('Error getting events of host:', error)
    return []
  }
}
