# Cache Revalidation Documentation

This document provides a comprehensive overview of all functions using `unstable_cache` and their associated cache keys, tags, and revalidation points.

> **Production incident:** If cached queries return empty data after a DB outage or Neon cold start, see [UNSTABLE_CACHE_EMPTY_RESULTS.md](./errors/UNSTABLE_CACHE_EMPTY_RESULTS.md).

---

## Table of Contents
1. [Functions Using `unstable_cache`](#functions-using-unstable_cache)
2. [Tag-Based Revalidation Mapping](#tag-based-revalidation-mapping)
3. [Summary by Tag](#summary-by-tag)

---

## Functions Using `unstable_cache`

### Events

#### 1. `getAllPublishedEvents`
- **File**: `lib/actions/event/getEvent.ts`
- **Cache Key**: `['events-published-all']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns minimal fields (id, title) for backward compatibility

#### 2. `getAllPublishedEventsWithRelations`
- **File**: `lib/actions/event/getEvent.ts`
- **Cache Key**: `['events-published-with-relations']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all published events with relations (categories, tickets)

#### 3. `getPublishedEventsWithFilters`
- **File**: `lib/actions/event/getEvent.ts`
- **Cache Key**: `['events-published-filtered']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published events with filters (numberOfEvents, upcoming, finished, orderByField, etc.)

#### 4. `getClosestFutureEvent`
- **File**: `lib/actions/event/getEvent.ts`
- **Cache Key**: `['events-closest-future']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns the closest future published event (ordered by startDate ascending)

#### 5. `getEventById` (via `getCachedEventById`)
- **File**: `lib/actions/event/getEventById.ts`
- **Cache Key**: `['event-by-id']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns a single event by ID with relations (hosts, schedules). Time filtering is applied after cache retrieval.

#### 6. `getEventPagination` (via `getCachedEventPagination`)
- **File**: `lib/actions/event/getEventPagination.ts`
- **Cache Key**: `['events-pagination']`
- **Tags**: `['events']`
- **Revalidate Time**: 3600 seconds (1 hour - shorter due to time-based filtering)
- **Description**: Returns paginated events with search and filtering. Time filtering is applied after cache retrieval.

#### 7. `getEventByKeyName`
- **File**: `lib/actions/event/getEventById.ts`
- **Cache Key**: `['event-by-keyname']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns a single event by keyName with full relations (schedules, categories, hosts, tickets, sponsors, series). Used for event detail pages and metadata generation.

#### 8. `getEventForEditing`
- **File**: `lib/actions/event/getEventById.ts`
- **Cache Key**: `['event-for-editing']`
- **Tags**: `['events']`
- **Revalidate Time**: 3600 seconds (1 hour)
- **Description**: Returns a single event by keyName specifically for editing, with all necessary relations (schedules ordered by position, categories, hosts with role and id, series, tickets with non-refunded payments). Includes exported `EventForEditing` type inferred from return type using `NonNullable<Awaited<ReturnType<typeof getEventForEditing>>>`. Used in admin edit event pages.

#### 9. `getAllEvents`
- **File**: `lib/actions/event/getEvent.ts`
- **Cache Key**: `['events-all']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all events (published and unpublished) for admin use only. Cache is invalidated when events are created/updated/deleted.

#### 10. `getAllEventCategories`
- **File**: `lib/actions/event/getEventCategories.ts`
- **Cache Key**: `['event-categories-all']`
- **Tags**: `['event-categories']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all event categories ordered by title. Categories are relatively static reference data, perfect for caching.

#### 11. `getAllEventSeries`
- **File**: `lib/actions/event/getEventSeries.ts`
- **Cache Key**: `['event-series-all']`
- **Tags**: `['series']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all event series ordered by name. Series are relatively static reference data, perfect for caching. Uses 'series' tag for consistency with existing series cache.

#### 12. `getAllEventSponsors`
- **File**: `lib/actions/event/getEventSponsors.ts`
- **Cache Key**: `['event-sponsors-all']`
- **Tags**: `['event-sponsors']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all event sponsors with their associated events, ordered by name. Sponsors are relatively static reference data, perfect for caching.

#### 13. `getEventTickets`
- **File**: `lib/actions/ticket/getEventTickets.ts`
- **Cache Key**: `['event-tickets-by-event']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all tickets for a specific event with id, type, and price, ordered by price ascending. Used in AddPaymentButton component to populate ticket selection dropdown. Tagged with 'events' since tickets are part of event data and should be revalidated when events or tickets change.

#### 14. `getEventDiscountsAndTickets`
- **File**: `lib/actions/event/getEventDiscountsAndTickets.ts`
- **Cache Key**: `['event-discounts-tickets']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns event discounts (eventDiscounts) and tickets (id, price, discountMemberPercent, capacityPerTicket, payTotalNumber) for a specific event. Used in checkout session creation to calculate discounts. Tagged with 'events' since discounts and tickets are part of event data and should be revalidated when events, discounts, or tickets change.

#### 15. `getEventForm`
- **File**: `lib/actions/event/getEventForm.ts`
- **Cache Key**: `['event-form']`
- **Tags**: `['events']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns the FormData JSON from the EventForm table for a specific event. Contains custom registration questions (question, description, type, required, options) that participants must answer when registering for the event. Used in EventForm component to display and edit custom form fields. Tagged with 'events' since event forms are part of event data and should be revalidated when event forms are created/updated/deleted.

#### 16. `getCachedSiblingSeriesGalleryUrls` (used by `getSeriesGalleries`)
- **File**: `lib/actions/event/getSeriesGalleries.ts`
- **Cache Key**: `['series-sibling-galleries']` (combined with serialized arguments `seriesId` and `excludeEventId` so each series/current-event pair is cached separately)
- **Tags**: `['events', 'series']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Loads `imgUrls` from other **published** events in the same `EventSeries`, excluding the current event (`excludeEventId`), for the public event gallery carousel. The exported `getSeriesGalleries` server action merges this list with the current page’s `imageUrls` (normalized, deduped, current event order first). Invalidated whenever `revalidateTag('events')` or `revalidateTag('series')` runs—for example event create/edit/publish/unpublish/delete, series assignment changes, or series create/edit.

---

### Jobs

#### 17. `getAllJobs`
- **File**: `lib/actions/job/getJob.ts`
- **Cache Key**: `['jobs-all']`
- **Tags**: `['jobs']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all jobs (published and unpublished) for admin management, ordered by updatedAt descending

#### 18. `getPublishedJobs`
- **File**: `lib/actions/job/getJob.ts`
- **Cache Key**: `['jobs-published']`
- **Tags**: `['jobs']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published jobs with optional filters (title search and event filter). Includes event relation (id, title, keyName) if job is linked to an event. Ordered by updatedAt descending.

#### 19. `getJobForEditing`
- **File**: `lib/actions/job/getJob.ts`
- **Cache Key**: `['job-for-editing']`
- **Tags**: `['jobs']`
- **Revalidate Time**: 3600 seconds (1 hour)
- **Description**: Returns a single job by keyName specifically for editing, with event relation (id, title). Includes exported `JobForEditing` type inferred from return type using `NonNullable<Awaited<ReturnType<typeof getJobForEditing>>>`. Used in admin edit job pages.

---

### Reviews

#### 20. `getCachedReviewsPaginated`
- **File**: `lib/actions/review/reviewActions.ts`
- **Cache Key**: `['reviews-paginated']`
- **Tags**: `['reviews']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns paginated reviews with search, filtering, and pagination support

#### 21. `getCachedPublishedEventsForReviews`
- **File**: `lib/actions/review/reviewActions.ts`
- **Cache Key**: `['published-events-reviews']`
- **Tags**: `['events', 'reviews']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published events for review filtering with search support

#### 22. `getCachedPublishedSeriesForReviews`
- **File**: `lib/actions/review/reviewActions.ts`
- **Cache Key**: `['published-series-reviews']`
- **Tags**: `['series', 'reviews']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published series that have events with reviews

---

### Posts

#### 23. `getCachedPostsPaginated`
- **File**: `lib/actions/post/getPosts.ts`
- **Cache Key**: `['posts-paginated']`
- **Tags**: `['posts']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns paginated posts with search by title

#### 24. `getAllPosts`
- **File**: `lib/actions/post/getPosts.ts`
- **Cache Key**: `['posts-all']`
- **Tags**: `['posts']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all posts (published and unpublished) for admin management, ordered by updatedAt descending

#### 25. `getPostForEditing`
- **File**: `lib/actions/post/getPosts.ts`
- **Cache Key**: `['post-for-editing']`
- **Tags**: `['posts']`
- **Revalidate Time**: 3600 seconds (1 hour)
- **Description**: Returns a single post by id specifically for editing. Includes exported `PostForEditing` type inferred from return type using `NonNullable<Awaited<ReturnType<typeof getPostForEditing>>>`. Used in admin edit post pages.

---

### Social Media Posts

#### 26. `getCachedSocialMediaPostsPaginated`
- **File**: `lib/actions/post/getSocialPost.ts`
- **Cache Key**: `['social-media-posts']`
- **Tags**: `['social-posts']`
- **Revalidate Time**: 600 seconds (10 minutes)
- **Description**: Returns paginated social media posts from Facebook and Instagram

---

### Users

#### 27. `getUsersSimple` (via `getCachedUsersSimple`)
- **File**: `lib/actions/user/getAllUsersSimple.ts`
- **Cache Key**: `['users-simple']`
- **Tags**: `['users']`
- **Revalidate Time**: 3600 seconds (1 hour)
- **Description**: Returns list of users with optional count limit and name search

#### 28. `getUsersWithRole` (via `getCachedUsersWithRole`)
- **File**: `lib/actions/user/getUsersWithRole.ts`
- **Cache Key**: `['users-with-role']`
- **Tags**: `['users']`
- **Revalidate Time**: 3600 seconds (1 hour)
- **Description**: Returns users filtered by role with optional name search

---

### Payments

#### 29. `getPaginatedPayments`
- **File**: `lib/actions/payment/getPaginatedPayments.ts`
- **Cache Key**: `['payments-*']` (per-request key derived from user role, userId, page, and pageSize)
- **Tags**: `['payments']`
- **Revalidate Time**: 300 seconds (5 minutes)
- **Description**: Returns paginated payments (with user and event relations) for admin/host payment management UI. Cached via `unstable_cache(fetchPaymentsData, [cacheKey], { tags: ['payments'] })`.

#### 30. `getEventPayments`
- **File**: `lib/actions/payment/getEventPayments.ts`
- **Cache Key**: `['event-payments-v7-${eventId}']` (per event)
- **Tags**: `['payments']`
- **Revalidate Time**: 86400 seconds (1 day)
- **Description**: Returns all non-refunded payments for a specific event with user and event details. Used by Event Manager to display sold tickets table and calculate statistics. Cached per event to reduce loading time when switching between events.

#### 31. `getEventShopPayments`
- **File**: `lib/actions/payment/getEventShopPayments.ts`
- **Cache Key**: `['event-shop-payments-v1-${eventId}']` (per event)
- **Tags**: `['payments', 'shops']`
- **Revalidate Time**: 86400 seconds (1 day)
- **Description**: Returns all non-refunded payments where the payment belongs to a shop linked to the selected event (`shop.eventId = eventId`). Used by Event Manager Shop tab to display shop payment summary and details. Cached per event to reduce loading time when switching between events.

#### 32. `getShopPayments`
- **File**: `lib/actions/payment/getShopPayments.ts`
- **Cache Key**: `['shop-payments-v1-${shopId}']` (per shop)
- **Tags**: `['payments', 'shops']`
- **Revalidate Time**: 86400 seconds (1 day)
- **Description**: Returns all non-refunded payments for a specific shop (`payment.shopId = shopId`) with user, shop, and shop item details. Used by Shop Manager and reusable Shop payment summary component.

---

### Shops

#### 33. `getAllShops`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shops-all']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all shops (published and unpublished) for admin use only, ordered by updatedAt descending. Includes event relation (title).

#### 34. `getAllPublishedShops`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shops-published-all']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published shops with optional select fields. Default returns minimal fields (id, title) for backward compatibility.

#### 35. `getAllPublishedShop`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shops-published-list-v1']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns published shops with minimal fields (`id`, `title`) ordered by `updatedAt desc`. Alias-style function created for Shop Manager dropdown usage.

#### 36. `getShopsOfShopOwner`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shops-by-owner-v1-${ownerId}']` (per owner)
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns shops owned by a specific shop owner (`ownerId`) with minimal fields (`id`, `title`) ordered by `updatedAt desc`. Used for shop-owner scoped dropdowns.

#### 37. `getShopById`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shop-by-id']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns a single shop by ID with shopItems and event relations.

#### 38. `getShopBySlug`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shop-by-slug']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns a single shop by slug with shopItems and event relations. Used for shop detail pages.

#### 39. `getShopForEditing`
- **File**: `lib/actions/shop/getShop.ts`
- **Cache Key**: `['shop-for-editing']`
- **Tags**: `['shops']`
- **Revalidate Time**: 86400 seconds (1 day)
- **Description**: Returns a single shop by ID specifically for editing, with shopItems (ordered by createdAt) and event relation (id, title, keyName). Used in admin edit shop pages.
 
#### 40. `getAllShopItemTags`
- **File**: `lib/actions/shop/shopItem/tag/getShopItemTag.ts`
- **Cache Key**: `['shop-item-tags-all']`
- **Tags**: `['shops']`
- **Revalidate Time**: 604800 seconds (7 days)
- **Description**: Returns all existing `ShopItemTag` records across all shops, ordered by title. Tagged with `'shops'` so tag data stays in sync when shop items and their tags are created, updated, or deleted.

---

### Receipts

#### 41. `getAllReceipts`
- **File**: `lib/actions/receipt/getReceipt.ts`
- **Cache Key**: `['receipts-all']` (argument-sensitive: `canViewAll`, `userId`)
- **Tags**: `['receipts']`
- **Revalidate Time**: 86400 seconds (1 day)
- **Description**: Returns receipts with receipt items for the VVF Finance profile tab. Admin/SuperAdmin can request all receipts; other users are scoped by `userId`.

---

## Tag-Based Revalidation Mapping

### Tag: `'events'`

**Cached Functions Affected:**
- `getAllPublishedEvents`
- `getAllPublishedEventsWithRelations`
- `getPublishedEventsWithFilters`
- `getClosestFutureEvent`
- `getEventById` (via `getCachedEventById`)
- `getEventPagination` (via `getCachedEventPagination`)
- `getEventByKeyName`
- `getEventForEditing`
- `getAllEvents`
- `getEventTickets` (via `getCachedEventTickets`)
- `getEventDiscountsAndTickets`
- `getEventForm`
- `getCachedSiblingSeriesGalleryUrls` (via `getSeriesGalleries`; also tagged with `'series'`)
- `getCachedPublishedEventsForReviews` (also tagged with 'reviews')

**Functions Calling `revalidateTag('events')`:**

1. **`app/api/events/create/route.ts`**
   - Function: `POST`
   - Line: 21
   - Action: Creates a new event

2. **`app/api/events/edit/[eventKeyName]/route.ts`**
   - Function: `PUT`
   - Line: 53
   - Action: Updates an existing event

3. **`app/api/events/publish/[eventKeyName]/route.ts`**
   - Function: `PATCH`
   - Line: 32
   - Action: Publishes an event (sets isPublished to true)

4. **`app/api/events/unpublish/[eventKeyName]/route.ts`**
   - Function: `PATCH`
   - Line: 34
   - Action: Unpublishes an event (sets isPublished to false)

5. **`app/api/events/delete/[eventKeyName]/route.ts`**
   - Function: `DELETE`
   - Line: 36
   - Action: Deletes an event

6. **`app/api/events/edit/[eventKeyName]/series/edit/route.ts`**
   - Function: `PUT` (line 35)
   - Function: `DELETE` (line 73)
   - Action: Adds or removes series from an event

7. **`app/api/events/edit/[eventKeyName]/hosts/edit/route.ts`**
   - Function: `PUT` (line 37)
   - Function: `DELETE` (line 81)
   - Action: Adds or removes hosts from an event

8. **`app/api/events/edit/[eventKeyName]/categories/edit/route.ts`**
   - Function: `POST` (line 28)
   - Function: `DELETE` (line 62)
   - Action: Adds or removes categories from an event

9. **`app/api/events/tickets/route.ts`**
   - Function: `POST` (create ticket)
   - Function: `PUT` (update ticket)
   - Function: `DELETE` (delete ticket)
   - Action: Creates, updates, or deletes event tickets. Tickets are included in cached event queries, so changes must invalidate the cache.

10. **`app/api/events/schedule/scheduleItem/add/route.ts`**
    - Function: `POST`
    - Action: Adds a new schedule item to an event. Schedules are included in cached event queries, so changes must invalidate the cache.

11. **`app/api/events/schedule/scheduleItem/edit/[scheduleItemId]/route.ts`**
    - Function: `PUT`
    - Action: Updates an existing schedule item. Schedules are included in cached event queries, so changes must invalidate the cache.

12. **`app/api/events/schedule/scheduleItem/delete/[itemId]/route.ts`**
    - Function: `DELETE`
    - Action: Deletes a schedule item from an event. Schedules are included in cached event queries, so changes must invalidate the cache.

13. **`app/api/events/forms/[eventKeyName]/route.ts`**
    - Function: `PUT`
    - Action: Creates or updates event form data. Event forms are part of event data, so changes must invalidate the cache.

14. **`app/api/events/discounts/[eventKeyName]/route.ts`**
    - Function: `PUT`
    - Line: 66
    - Action: Creates or updates event discounts data (stored in eventDiscounts JSON field). Event discounts are part of event data, so changes must invalidate the cache.

15. **`app/api/jobs/edit/[jobId]/route.ts`**
    - Function: `PUT` (conditional)
    - Line: 44
    - Action: When a job's eventId is changed (linking/unlinking from an event), this triggers event cache revalidation. This is necessary because event queries include linked jobs, and the volunteer section visibility depends on this data.

16. **`app/api/sponsors/create/route.ts`**
    - Function: `POST`
    - Line: 31
    - Action: Creates a new event sponsor with event associations. Sponsors are included in cached event queries (e.g., `getEventByKeyName` includes sponsors), so changes must invalidate the cache.

17. **`app/api/sponsors/edit/[sponsorId]/route.ts`**
    - Function: `PUT`
    - Line: 47
    - Action: Updates an existing event sponsor (including event associations and isPartner field). Sponsors are included in cached event queries (e.g., `getEventByKeyName` includes sponsors), so changes must invalidate the cache.

---

### Tag: `'reviews'`

**Cached Functions Affected:**
- `getCachedReviewsPaginated`
- `getCachedPublishedEventsForReviews` (also tagged with 'events')
- `getCachedPublishedSeriesForReviews` (also tagged with 'series')

**Functions Calling `revalidateTag('reviews')`:**

1. **`lib/actions/review/reviewActions.ts`**
   - Function: `createReview` (line 270)
     - Action: Creates a new review
   - Function: `updateReview` (line 509)
     - Action: Updates an existing review
   - Function: `deleteReview` (line 528)
     - Action: Deletes a review

---

### Tag: `'posts'`

**Cached Functions Affected:**
- `getCachedPostsPaginated`
- `getAllPosts`
- `getPostForEditing`

**Functions Calling `revalidateTag('posts')`:**

1. **`app/api/posts/create/route.tsx`**
   - Function: `POST`
   - Line: 20
   - Action: Creates a new post

2. **`app/api/posts/edit/[postId]/route.tsx`**
   - Function: `PUT`
   - Line: 36
   - Action: Updates an existing post

3. **`app/api/posts/publish/[postId]/route.ts`**
   - Function: `PATCH`
   - Line: 34
   - Action: Publishes a post (sets isPublished to true)

4. **`app/api/posts/unpublish/[postId]/route.ts`**
   - Function: `PATCH`
   - Line: 34
   - Action: Unpublishes a post (sets isPublished to false)

5. **`app/api/posts/delete/[postId]/route.ts`**
   - Function: `DELETE`
   - Line: 32
   - Action: Deletes a post

---

### Tag: `'series'`

**Cached Functions Affected:**
- `getCachedPublishedSeriesForReviews` (also tagged with 'reviews')
- `getAllEventSeries`
- `getCachedSiblingSeriesGalleryUrls` (via `getSeriesGalleries`; also tagged with `'events'`)

**Functions Calling `revalidateTag('series')`:**

1. **`app/api/series/create/route.ts`**
   - Function: `POST`
   - Line: 19
   - Action: Creates a new event series

2. **`app/api/series/edit/[seriesId]/route.ts`**
   - Function: `PUT`
   - Line: 36
   - Action: Updates an existing event series

**Note:** Any route that calls `revalidateTag('events')` also refreshes series sibling gallery data, because `getCachedSiblingSeriesGalleryUrls` is tagged with `'events'`. Series-only mutations use `revalidateTag('series')` and invalidate the same cache entries.

---

### Tag: `'event-categories'`

**Cached Functions Affected:**
- `getAllEventCategories`

**Functions Calling `revalidateTag('event-categories')`:**

1. **`app/api/categories/create/route.tsx`**
   - Function: `POST`
   - Line: After category creation
   - Action: Creates a new event category

2. **`app/api/categories/edit/[categoryId]/route.ts`**
   - Function: `PUT`
   - Line: After category update
   - Action: Updates an existing event category

---

### Tag: `'event-sponsors'`

**Cached Functions Affected:**
- `getAllEventSponsors`

**Functions Calling `revalidateTag('event-sponsors')`:**

1. **`app/api/sponsors/create/route.ts`**
   - Function: `POST`
   - Line: 30-31
   - Action: Creates a new event sponsor
   - Also calls: `revalidateTag('events')` - Sponsors are included in cached event queries, so changes must invalidate the events cache as well

2. **`app/api/sponsors/edit/[sponsorId]/route.ts`**
   - Function: `PUT`
   - Line: 46
   - Action: Updates an existing event sponsor (including event associations and isPartner field)
   - Also calls: `revalidateTag('events')` - Sponsors are included in cached event queries, so changes must invalidate the events cache as well

---

### Tag: `'social-posts'`

**Cached Functions Affected:**
- `getCachedSocialMediaPostsPaginated`

**Functions Calling `revalidateTag('social-posts')`:**
- **None found** - This tag is used but no explicit revalidation calls were found in the codebase. Since this fetches external API data (Facebook/Instagram), manual revalidation may not be necessary, but consider adding it if needed.

---

### Tag: `'users'`

**Cached Functions Affected:**
- `getUsersSimple` (via `getCachedUsersSimple`)
- `getUsersWithRole` (via `getCachedUsersWithRole`)

**Functions Calling `revalidateTag('users')`:**

1. **`app/api/users/edit/route.ts`**
   - Function: `PUT`
   - Line: After user update
   - Action: Updates user information (name, age, phone, address, image)

2. **`app/api/users/phone-verified/route.ts`**
   - Function: `POST`
   - Line: After phone verification update
   - Action: Updates user phone verification status

3. **`lib/actions/user/updateUser.ts`**
   - Function: `updateUser` (server action)
   - Line: After user update
   - Action: Updates user profile information

4. **`lib/actions/user/deleteUser.ts`**
   - Function: `deleteUser` (server action)
   - Line: After user deletion
   - Action: Deletes a user account

5. **`lib/actions/auth/signupAction.ts`**
   - Function: `signupAction` (server action)
   - Line: After user creation
   - Action: Creates a new user account

6. **`app/api/auth/m/signup/route.ts`**
   - Function: `POST`
   - Line: After user creation
   - Action: Creates a new user account via API

---

### Tag: `'jobs'`

**Cached Functions Affected:**
- `getAllJobs`
- `getPublishedJobs`
- `getJobForEditing`

**Functions Calling `revalidateTag('jobs')`:**

1. **`app/api/jobs/create/route.ts`**
   - Function: `POST`
   - Line: 22
   - Action: Creates a new job with title, jobType, keyName, and userId
   - Also calls: `revalidatePath('/registration/jobs', 'page')`

2. **`app/api/jobs/edit/[jobId]/route.ts`**
   - Function: `PUT`
   - Line: 39 (always), Line 44 (conditional)
   - Action: Updates an existing job (excluding isPublished field, which is handled by publish/unpublish routes)
   - Also calls: 
     - `revalidatePath('/registration/jobs', 'page')`
     - `revalidateTag('events')` - **conditionally called** when eventId changes (linking/unlinking job from event). This ensures event pages immediately show/hide volunteer sections based on linked jobs.

3. **`app/api/jobs/publish/[jobId]/route.ts`**
   - Function: `PATCH`
   - Line: 35
   - Action: Publishes a job (sets isPublished to true)
   - Also calls: `revalidatePath('/registration/jobs', 'page')`

4. **`app/api/jobs/unpublish/[jobId]/route.ts`**
   - Function: `PATCH`
   - Line: 35
   - Action: Unpublishes a job (sets isPublished to false)
   - Also calls: `revalidatePath('/registration/jobs', 'page')`

5. **`app/api/jobs/delete/[jobId]/route.ts`**
   - Function: `DELETE`
   - Line: 34
   - Action: Deletes a job (with foreign key constraint check for existing applications)
   - Also calls: `revalidatePath('/registration/jobs', 'page')`

**Note:** The `/api/jobs/apply/[jobId]` and `/api/jobs/apply/host` routes do NOT call `revalidateTag('jobs')` because they create job applications without modifying job data itself.

---

### Tag: `'payments'`

**Cached Functions Affected:**
- `getPaginatedPayments`
- `getEventPayments`
- `getShopPayments` (also tagged with 'shops')
- `getEventShopPayments` (also tagged with 'shops')

**Functions Calling `revalidateTag('payments')`:**

1. **`app/api/payment/refund/route.ts`**
   - Function: `POST`
   - Action: Processes a refund (and cancels a membership subscription when applicable), then revalidates the payments cache so refunded status and subscription changes are reflected in the admin UI.

2. **`lib/actions/payment/addPayment.ts`**
   - Function: `addPayment` (server action)
   - Action: Adds a manual payment record from the admin UI and revalidates the payments cache.

3. **`app/api/webhooks/stripe/route.ts`**
   - Function: `POST`
   - Action: Handles Stripe webhook events (`checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`), creates payment records, and revalidates the payments cache after successful creation.

---

### Tag: `'shops'`

**Cached Functions Affected:**
- `getAllShops`
- `getAllPublishedShops`
- `getAllPublishedShop`
- `getShopsOfShopOwner`
- `getShopById`
- `getShopBySlug`
- `getShopForEditing`
- `getShopPayments` (also tagged with 'payments')
- `getEventShopPayments` (also tagged with 'payments')

**Functions Calling `revalidateTag('shops')`:**

1. **`app/api/shops/create/route.ts`**
   - Function: `POST`
   - Line: 21
   - Action: Creates a new shop

2. **`app/api/shops/edit/[shopId]/route.ts`**
   - Function: `PUT`
   - Line: 37
   - Action: Updates an existing shop

3. **`app/api/shops/items/route.ts`**
   - Function: `POST` (line 105)
   - Function: `PUT` (line 280)
   - Function: `DELETE` (line 326)
   - Action: Creates, updates, or deletes shop items. Shop items are included in cached shop queries (e.g., `getShopById`, `getShopBySlug`, `getShopForEditing`), so changes must invalidate the cache.

4. **`app/api/shops/publish/[shopId]/route.ts`**
   - Function: `PATCH`
   - Line: 24
   - Action: Publishes a shop (sets isPublished to true)

5. **`app/api/shops/unpublish/[shopId]/route.ts`**
   - Function: `PATCH`
   - Line: 24
   - Action: Unpublishes a shop (sets isPublished to false)

---

### Tag: `'receipts'`

**Cached Functions Affected:**
- `getAllReceipts`

**Functions Calling `revalidateTag('receipts')`:**
- **None found yet** - Add `revalidateTag('receipts')` in receipt create/update/delete APIs once those mutation endpoints are added.

---

## Summary by Tag

### Complete Tag Coverage

| Tag | Cached Functions | Revalidation Points | Status |
|-----|-----------------|---------------------|--------|
| `events` | 14 functions | 17 API routes | ✅ Fully covered |
| `reviews` | 3 functions | 3 server actions | ✅ Fully covered |
| `posts` | 3 functions | 5 API routes | ✅ Fully covered |
| `series` | 3 functions | 2 API routes | ✅ Fully covered |
| `event-categories` | 1 function | 2 API routes | ✅ Fully covered |
| `event-sponsors` | 1 function | 2 API routes | ✅ Fully covered |
| `social-posts` | 1 function | 0 revalidation points | ⚠️ External API (may not need) |
| `users` | 2 functions | 6 revalidation points | ✅ Fully covered |
| `jobs` | 3 functions | 5 API routes | ✅ Fully covered |
| `payments` | 4 functions | 3 mutation points | ✅ Fully covered |
| `shops` | 10 functions | 5 API routes | ✅ Fully covered |
| `receipts` | 1 function | 0 revalidation points | ⚠️ Add when receipt mutations are implemented |

---

## Notes

1. **Cache Duration**: Most cached functions use a 7-day cache (604800 seconds), except for:
   - Social media posts: 10 minutes (600 seconds) due to external API calls
   - User-related functions: 1 hour (3600 seconds) due to more frequent data changes
   - Event pagination: 1 hour (3600 seconds) due to time-based filtering
   - Event for editing: 1 hour (3600 seconds) to ensure editors see recent changes more quickly
   - Job for editing: 1 hour (3600 seconds) to ensure editors see recent changes more quickly
   - Post for editing: 1 hour (3600 seconds) to ensure editors see recent changes more quickly
   - Shop for editing: 1 day (86400 seconds) to balance freshness with Shop Manager performance
   - Event payments and event shop payments: 1 day (86400 seconds) to improve admin event analytics performance
   - Shop payments by shop: 1 day (86400 seconds) to improve Shop Manager analytics performance
   - Receipts list: 1 day (86400 seconds) to improve VVF Finance tab loading

2. **Multi-Tag Functions**: Some functions use multiple tags (e.g., `getCachedPublishedEventsForReviews` uses both `'events'` and `'reviews'`), meaning they will be invalidated when either tag is revalidated.

3. **Series Revalidation**: The `'series'` tag is revalidated when series are created or updated via the API routes. Series-linked **event gallery** sibling URLs (`getSeriesGalleries` / `getCachedSiblingSeriesGalleryUrls`) use both `'events'` and `'series'` tags, so they refresh on event mutations and on series mutations.

4. **External Data**: Social media posts fetch from external APIs (Facebook/Instagram), so manual revalidation may not be necessary, but the cache will auto-refresh every 10 minutes.

5. **Event detail gallery**: `EventGalleryCarousel` calls `getSeriesGalleries` from the client; sibling gallery URLs are served through the cached helper above, not through `getEventByKeyName` alone.

---

## Usage Guidelines

- When creating, updating, or deleting events, always call `revalidateTag('events')`
- When creating, updating, or deleting event tickets, always call `revalidateTag('events')` (tickets are included in cached event queries)
- When creating, updating, or deleting event schedules, always call `revalidateTag('events')` (schedules are included in cached event queries)
- When creating, updating, or deleting event forms, always call `revalidateTag('events')`
- When creating or updating event discounts, always call `revalidateTag('events')` (discounts are stored in the event's eventDiscounts JSON field)
- When creating, updating, or deleting reviews, always call `revalidateTag('reviews')`
- When creating, updating, or deleting posts, always call `revalidateTag('posts')`
- When creating or updating series, always call `revalidateTag('series')` (this also invalidates cached series sibling gallery URLs used on event pages)
- When creating or updating event categories, always call `revalidateTag('event-categories')`
- When creating or updating event sponsors, always call `revalidateTag('event-sponsors')`
- **Additionally**, when creating or updating event sponsors (creating/editing sponsor associations or isPartner field), also call `revalidateTag('events')` since sponsors are included in cached event queries
- When creating, updating, or deleting users, or changing user roles, call `revalidateTag('users')`
- When creating, updating, publishing, unpublishing, or deleting jobs, always call `revalidateTag('jobs')`
- **Additionally**, call `revalidateTag('events')` when changing a job's eventId (linking/unlinking from event), as events include linked jobs and use this to display volunteer sections
- Note: Job applications do NOT require `revalidateTag('jobs')` as they don't modify job data
- When creating, updating, or refunding payments, always call `revalidateTag('payments')`
- When creating, updating, publishing, unpublishing, or deleting shops, always call `revalidateTag('shops')`
- When creating, updating, or deleting shop items, always call `revalidateTag('shops')` (shop items are included in cached shop queries)
- When creating, updating, or deleting receipts or receipt items, always call `revalidateTag('receipts')`
- Social media posts cache automatically refreshes every 10 minutes


