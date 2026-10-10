'use server'

import { prisma } from '@/lib/db'
import { Prisma, ReviewRating } from '@prisma/client'
import {
  RATING_MAP,
  convertReviewRatingToNumber,
} from '@/lib/utilFunctions/ratingUtils'
import { revalidateTag, unstable_cache } from 'next/cache'
import { withDbRetry } from '@/lib/db/withDbRetry'

export interface CreateReviewData {
  userId: string
  eventId?: string
  rating: string
  comment: string
  anonymous?: boolean
  imageLink?: string
}

export interface ReviewWithUserAndEvent {
  id: string
  createdAt: Date
  updatedAt: Date
  userId: string
  eventId: string | null
  rating: ReviewRating
  comment: string
  anonymous: boolean
  imageLink: string | null
  user: {
    name: string | null
    image: string | null
  } | null
  event: {
    title: string
  } | null
}

export interface ReviewsPaginationResult {
  reviews: ReviewWithUserAndEvent[]
  totalCount: number
  totalPages: number
  currentPage: number
}

// ========================================
// CACHED DATA FETCHING FUNCTIONS
// ========================================

// Cached version of getReviewsPaginated
export const getCachedReviewsPaginated = unstable_cache(
  async (
    page: number = 1,
    reviewsPerPage: number = 6,
    searchTerm?: string,
    eventId?: string,
    rating?: ReviewRating,
    removeEmptyComments?: boolean,
    seriesId?: string
  ): Promise<ReviewsPaginationResult> => {
    return withDbRetry(async () => {
      const skip = (page - 1) * reviewsPerPage

      // Build where clause
      const whereClause: Prisma.ReviewWhereInput = {}

      if (searchTerm) {
        whereClause.OR = [
          { comment: { contains: searchTerm, mode: 'insensitive' } },
          { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
          { event: { title: { contains: searchTerm, mode: 'insensitive' } } },
        ]
      }

      if (eventId) {
        whereClause.eventId = eventId
      } else if (seriesId) {
        // Only filter by series if eventId is not set (eventId is more specific)
        whereClause.event = {
          seriesId: seriesId,
        }
      }

      if (rating) {
        whereClause.rating = rating
      }

      if (removeEmptyComments) {
        // Exclude comments from specific user
        whereClause.userId = {
          not: 'cm5z8p8o90000lt6otnd5ukp8', // account using for uploading reviews
        }

        whereClause.comment = {
          not: {
            in: ['', ' ', '\t', '\n', '\r\n', '  ', '   '],
          },
        }
      }

      // Get reviews with pagination
      const [reviews, totalCount] = await Promise.all([
        prisma.review.findMany({
          where: whereClause,
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            eventId: true,
            rating: true,
            comment: true,
            anonymous: true,
            imageLink: true,
            user: {
              select: {
                name: true,
                image: true,
              },
            },
            event: {
              select: {
                title: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: reviewsPerPage,
        }),
        prisma.review.count({ where: whereClause }),
      ])

      const totalPages = Math.ceil(totalCount / reviewsPerPage)

      return {
        reviews,
        totalCount,
        totalPages,
        currentPage: page,
      }
    }, { label: 'getCachedReviewsPaginated' })
  },
  ['reviews-paginated'], // Cache key prefix
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['reviews'], // For on-demand revalidation
  }
)

// Cached version of getPublishedEventsForReviewsWithSearch
export const getCachedPublishedEventsForReviews = unstable_cache(
  async (searchTerm?: string, limit: number = 15) => {
    return withDbRetry(
      () =>
        prisma.event.findMany({
          where: {
            isPublished: true,
            ...(searchTerm && {
              title: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            }),
          },
          select: {
            id: true,
            title: true,
            keyName: true,
          },
          orderBy: {
            updatedAt: 'desc', // Latest events first
          },
          take: limit,
        }),
      { label: 'getCachedPublishedEventsForReviews' }
    )
  },
  ['published-events-reviews-v2'],
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['events', 'reviews'],
  }
)

// Cached version of getPublishedSeriesForReviewsWithSearch
export const getCachedPublishedSeriesForReviews = unstable_cache(
  async (searchTerm?: string, limit: number = 15) => {
    return withDbRetry(
      () =>
        prisma.eventSeries.findMany({
          where: {
            events: {
              some: {
                isPublished: true,
                Review: {
                  some: {}, // Only series that have events with reviews
                },
              },
            },
            ...(searchTerm && {
              name: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            }),
          },
          select: {
            id: true,
            name: true,
            keyName: true,
          },
          orderBy: {
            name: 'asc',
          },
          take: limit,
        }),
      { label: 'getCachedPublishedSeriesForReviews' }
    )
  },
  ['published-series-reviews'],
  {
    revalidate: 604800, // Cache for 7 days (revalidateTag handles on-demand invalidation)
    tags: ['series', 'reviews'],
  }
)

// ========================================
// SERVER ACTIONS (for mutations)
// ========================================

// Create a new review
export async function createReview(data: CreateReviewData) {
  try {
    const review = await prisma.review.create({
      data: {
        userId: data.userId,
        eventId: data.eventId || null,
        rating:
          RATING_MAP[data.rating as keyof typeof RATING_MAP] ||
          ReviewRating.One,
        comment: data.comment,
        anonymous: data.anonymous || false,
        imageLink: data.imageLink || null,
      },
    })

    // Revalidate cached reviews
    revalidateTag('reviews')

    return { success: true, review }
  } catch (error) {
    console.error('Error creating review:', error)
    return { success: false, message: 'Failed to create review' }
  }
}

// Get reviews with pagination, search, and filtering
export async function getReviewsPaginated(
  page: number = 1,
  reviewsPerPage: number = 6,
  searchTerm?: string,
  eventId?: string,
  rating?: ReviewRating,
  removeEmptyComments?: boolean,
  seriesId?: string
): Promise<ReviewsPaginationResult> {
  try {
    const skip = (page - 1) * reviewsPerPage

    // Build where clause
    const whereClause: Prisma.ReviewWhereInput = {}

    if (searchTerm) {
      whereClause.OR = [
        { comment: { contains: searchTerm, mode: 'insensitive' } },
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { event: { title: { contains: searchTerm, mode: 'insensitive' } } },
      ]
    }

    if (eventId) {
      whereClause.eventId = eventId
    } else if (seriesId) {
      // Only filter by series if eventId is not set (eventId is more specific)
      whereClause.event = {
        seriesId: seriesId,
      }
    }

    if (rating) {
      whereClause.rating = rating
    }

    if (removeEmptyComments) {
      // Exclude comments from specific user
      whereClause.userId = {
        not: 'cm5z8p8o90000lt6otnd5ukp8', // account using for uploading reviews
      }

      whereClause.comment = {
        not: {
          in: ['', ' ', '\t', '\n', '\r\n', '  ', '   '],
        },
      }
    }
    // Get reviews with pagination
    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany({
        where: whereClause,
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          eventId: true,
          rating: true,
          comment: true,
          anonymous: true,
          imageLink: true,
          user: {
            select: {
              name: true,
              image: true,
            },
          },
          event: {
            select: {
              title: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: reviewsPerPage,
      }),
      prisma.review.count({ where: whereClause }),
    ])
    const totalPages = Math.ceil(totalCount / reviewsPerPage)

    return {
      reviews,
      totalCount,
      totalPages,
      currentPage: page,
    }
  } catch (error) {
    console.error('Error getting reviews:', error)
    return {
      reviews: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    }
  }
}

// Get all published events for review filtering
export async function getPublishedEventsForReviews() {
  try {
    const events = await prisma.event.findMany({
      where: {
        isPublished: true,
      },
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        title: 'asc',
      },
    })

    return events
  } catch (error) {
    console.error('Error getting published events for reviews:', error)
    return []
  }
}

// Get published events with search and limit for review filtering
export async function getPublishedEventsForReviewsWithSearch(
  searchTerm?: string,
  limit: number = 15
) {
  try {
    const events = await prisma.event.findMany({
      where: {
        isPublished: true,
        ...(searchTerm && {
          title: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        }),
      },
      select: {
        id: true,
        title: true,
        keyName: true,
      },
      orderBy: {
        updatedAt: 'desc', // Latest events first
      },
      take: limit,
    })

    return events
  } catch (error) {
    console.error(
      'Error getting published events for reviews with search:',
      error
    )
    return []
  }
}

// Get all series that have published events with reviews
export async function getPublishedSeriesForReviewsWithSearch(
  searchTerm?: string,
  limit: number = 15
) {
  try {
    const series = await prisma.eventSeries.findMany({
      where: {
        events: {
          some: {
            isPublished: true,
            Review: {
              some: {}, // Only series that have events with reviews
            },
          },
        },
        ...(searchTerm && {
          name: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        }),
      },
      select: {
        id: true,
        name: true,
        keyName: true,
      },
      orderBy: {
        name: 'asc',
      },
      take: limit,
    })

    return series
  } catch (error) {
    console.error(
      'Error getting published series for reviews with search:',
      error
    )
    return []
  }
}

// Update a review (owner only)
export async function updateReview(
  reviewId: string,
  data: {
    comment: string
    rating: ReviewRating
    anonymous?: boolean
    imageLink?: string | null
  }
) {
  try {
    await prisma.review.update({
      where: {
        id: reviewId,
      },
      data: {
        comment: data.comment,
        rating: data.rating,
        anonymous: data.anonymous,
        imageLink: data.imageLink,
        updatedAt: new Date(),
      },
    })

    // Revalidate cached reviews
    revalidateTag('reviews')

    return { success: true }
  } catch (error) {
    console.error('Error updating review:', error)
    return { success: false, message: 'Failed to update review' }
  }
}

// Delete a review (admin only)
export async function deleteReview(reviewId: string) {
  try {
    await prisma.review.delete({
      where: {
        id: reviewId,
      },
    })

    // Revalidate cached reviews
    revalidateTag('reviews')

    return { success: true }
  } catch (error) {
    console.error('Error deleting review:', error)
    return { success: false, message: 'Failed to delete review' }
  }
}

// Get top 5 recent events with highest ratings
export async function getTopRatedRecentEvents(limit: number = 5) {
  try {
    const events = await prisma.event.findMany({
      where: {
        isPublished: true,
        Review: {
          some: {}, // Only events that have at least one review
        },
      },
      select: {
        id: true,
        title: true,
        imgUrl: true,
        startDate: true,
        location: true,
        createdAt: true,
        Review: {
          select: {
            rating: true,
            comment: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Get recent events first
      },
      take: 50, // Get more events to calculate ratings from
    })

    // Calculate average rating and find highest rating comment for each event
    const eventsWithRatings = events.map((event) => {
      const reviewsWithRatings = event.Review.map((review) => {
        const ratingValue = convertReviewRatingToNumber(review.rating)

        return {
          ...review,
          ratingValue,
        }
      })

      const ratings = reviewsWithRatings.map((review) => review.ratingValue)
      const averageRating =
        ratings.length > 0
          ? ratings.reduce((sum: number, rating: number) => sum + rating, 0) /
            ratings.length
          : 0

      // Find the review with the highest rating (first one if there are ties)
      const highestRatingReview = reviewsWithRatings.reduce(
        (highest, current) => {
          return current.ratingValue > highest.ratingValue ? current : highest
        },
        reviewsWithRatings[0]
      )

      return {
        ...event,
        averageRating,
        reviewCount: ratings.length,
        highestRatingReview: highestRatingReview
          ? {
              rating: highestRatingReview.ratingValue,
              comment: highestRatingReview.comment,
              userName: highestRatingReview.user?.name || 'Anonymous',
            }
          : null,
      }
    })

    // Sort by average rating (highest first) and take top 5
    const topRatedEvents = eventsWithRatings
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, limit)

    return topRatedEvents
  } catch (error) {
    console.error('Error getting top rated recent events:', error)
    return []
  }
}
