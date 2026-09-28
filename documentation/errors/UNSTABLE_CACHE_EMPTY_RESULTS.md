# Production Empty Cache Bug (`unstable_cache` + Neon/Prisma)

This document describes a production issue where events, posts, and reviews disappeared from the public site even though the database contained data. It explains the root cause, why it looked like a Neon or Prisma bug, and the fixes applied in this codebase.

---

## Table of Contents

1. [Symptoms](#symptoms)
2. [Root Cause](#root-cause)
3. [What It Is Not](#what-it-is-not)
4. [Failure Flow](#failure-flow)
5. [Fixes Applied](#fixes-applied)
6. [Environment Requirements](#environment-requirements)
7. [Recovery Steps](#recovery-steps)
8. [Guidelines for New Cached Queries](#guidelines-for-new-cached-queries)
9. [Related Files](#related-files)
10. [References](#references)

---

## Symptoms

- Homepage or listing pages show **no events**, **no posts**, or **no reviews**
- Issue appears **intermittently in production** (often after idle periods or deploys)
- Data is still present in Neon when queried directly (SQL Editor, Prisma Studio, admin tools)
- Problem may persist for **hours or days** until redeploy or manual cache invalidation
- Local development often works fine; production on Vercel serverless is affected
- Happens on Neon Pro plan — **not** caused by exhausting database quota

---

## Root Cause

Two issues combined to create the bug:

### 1. `unstable_cache` cached error fallbacks (primary cause)

Cached data fetchers used this pattern:

```typescript
export const getAllPublishedEvents = unstable_cache(
  async () => {
    try {
      return await prisma.event.findMany({ ... })
    } catch (error) {
      console.error('Error getting published events:', error)
      return []  // ← cached as valid data for up to 7 days
    }
  },
  ['events-published-all'],
  { revalidate: 604800, tags: ['events'] }
)
```

`unstable_cache` stores **whatever the callback returns**, including:

- `[]` (empty array)
- `null`
- `{ reviews: [], totalCount: 0 }`

With `revalidate: 604800` (7 days), a single failed query during a Neon cold start was cached as “no data exists” and served to all users until TTL expiry or tag revalidation.

**Important:** `export const dynamic = 'force-dynamic'` on a page does **not** bypass `unstable_cache`. The Next.js Data Cache is independent of page rendering mode.

### 2. Neon cold starts triggered transient DB failures (trigger)

Neon scales compute to zero after inactivity (~5 minutes by default). The first query after idle must wake the database. During that window, Prisma can fail with:

- `P1001: Can't reach database server`
- `Timed out fetching a new connection from the connection pool`
- `Server has closed the connection`

Default Prisma `connect_timeout` is 5 seconds, which is often too short for cold starts on serverless (Vercel).

---

## What It Is Not

| Suspected cause | Verdict |
|----------------|---------|
| Neon Pro quota exhausted | No — unrelated to plan limits |
| Prisma returning wrong query results | No — queries work when the connection succeeds |
| `revalidateTag` broken | No — tags work; they just don't run on DB failures |
| Legitimate empty database | No — only when data truly doesn't exist (successful query returning `[]`) |

---

## Failure Flow

```
User request (homepage)
        │
        ▼
unstable_cache miss → run callback
        │
        ▼
Neon compute waking from idle (cold start)
        │
        ▼
Prisma connection timeout / P1001
        │
        ▼
catch block → return []
        │
        ▼
unstable_cache stores [] for 7 days
        │
        ▼
All later requests → cached [] → empty UI
```

`revalidateTag('events')` only runs when content is created/updated/deleted via API routes. A cache entry poisoned by a DB failure is **not** cleared by normal content edits unless that specific tag is invalidated.

---

## Fixes Applied

Three changes were implemented across all functions using `unstable_cache`:

### Fix 1 — Stop caching error fallbacks

Remove `catch → return []/null` inside `unstable_cache` callbacks. **Throw** on DB errors so nothing is cached.

```typescript
// ✅ Correct — only successful query results are cached
return withDbRetry(
  () => prisma.event.findMany({ where: { isPublished: true } }),
  { label: 'getAllPublishedEvents' }
)

// ❌ Wrong — transient failures become long-lived empty cache
try {
  return await prisma.event.findMany(...)
} catch {
  return []
}
```

Legitimate empty results (`findMany` succeeds but returns `[]`, or `findFirst` returns `null`) are still cached correctly.

### Fix 2 — Retry transient connection errors

`lib/db/withDbRetry.ts` retries up to 3 times with linear backoff (1s, 2s, 3s) for transient errors:

- Prisma codes: `P1001`, `P1002`, `P1008`, `P1017`
- Messages: `connection pool`, `Can't reach database`, `Server has closed`
- Network: `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `timeout`

All DB-backed `unstable_cache` callbacks now wrap queries with `withDbRetry()`.

### Fix 3 — Neon connection hardening

`lib/db/connectionString.ts` and `lib/db.ts`:

- Auto-append `connect_timeout=15` and `pool_timeout=15` to `DATABASE_URL` if missing
- Warn in production if `DATABASE_URL` does not use the `-pooler` hostname
- Persist Prisma client singleton in production via `globalForPrisma.prisma`

---

## Environment Requirements

### Production `DATABASE_URL`

Use Neon's **pooled** connection string (hostname contains `-pooler`):

```text
postgresql://user:password@ep-xxxxx-pooler.us-east-2.aws.neon.tech/dbname?sslmode=require
```

The application automatically adds timeout params if absent:

```text
connect_timeout=15
pool_timeout=15
```

### Optional: direct URL for migrations

For Prisma CLI migrations, Neon recommends a separate non-pooled URL. If needed, add to `.env`:

```text
DIRECT_URL=postgresql://user:password@ep-xxxxx.us-east-2.aws.neon.tech/dbname?sslmode=require
```

And in `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Vercel + Neon checklist

- [ ] `DATABASE_URL` uses `-pooler` endpoint
- [ ] Vercel region matches Neon region (lower latency, fewer timeouts)
- [ ] On Neon Pro: consider disabling scale-to-zero or increasing suspend timeout if cold starts are unacceptable

---

## Recovery Steps

If the site is currently showing empty data from a poisoned cache:

### Option A — Revalidate tags (fastest)

Trigger from an admin API route or a one-off script:

```typescript
import { revalidateTag } from 'next/cache'

revalidateTag('events')
revalidateTag('posts')
revalidateTag('reviews')
```

### Option B — Redeploy

Redeploying clears the Data Cache for affected entries on the next successful fetch.

### Option C — Wait for TTL

Cache entries expire after their `revalidate` window (typically 604800 seconds / 7 days for public content). Not recommended for active incidents.

### Confirming the issue in logs

Search production logs for patterns like:

```text
Error getting published events:
Error getting closest future event:
Error getting reviews:
P1001: Can't reach database server
Timed out fetching a new connection from the connection pool
```

If these appear immediately before the site goes empty, the poisoned-cache scenario is confirmed.

---

## Guidelines for New Cached Queries

When adding a new `unstable_cache` wrapper:

1. **Always** use `withDbRetry()` for Prisma calls
2. **Never** catch DB errors and return `[]` / `null` inside the cached callback
3. Use `revalidateTag` on mutations (create/update/delete) — see [CACHE_REVALIDATION_DOCUMENTATION.md](../CACHE_REVALIDATION_DOCUMENTATION.md)
4. Keep `revalidate` as a safety net, not the primary invalidation mechanism
5. Distinguish “query failed” (throw) from “no rows found” (return `[]` or `null`)

Example template:

```typescript
import { unstable_cache } from 'next/cache'
import { withDbRetry } from '@/lib/db/withDbRetry'

export const getCachedItems = unstable_cache(
  async () => {
    const { prisma } = await import('@/lib/db')
    return withDbRetry(
      () => prisma.item.findMany({ where: { isPublished: true } }),
      { label: 'getCachedItems' }
    )
  },
  ['items-published'],
  {
    revalidate: 604800,
    tags: ['items'],
  }
)
```

For non-DB cached sources (e.g. external APIs like Facebook Graph), throw on fetch failure instead of returning empty arrays so failed API responses are not cached either.

---

## Related Files

| File | Purpose |
|------|---------|
| `lib/db/withDbRetry.ts` | Retry helper for transient DB errors |
| `lib/db/connectionString.ts` | Neon timeout params + pooler warning |
| `lib/db.ts` | Prisma singleton + connection string setup |
| `lib/actions/event/getEvent.ts` | Example event cached queries |
| `lib/actions/post/getPosts.ts` | Example post cached queries |
| `lib/actions/review/reviewActions.ts` | Example review cached queries |
| [CACHE_REVALIDATION_DOCUMENTATION.md](../CACHE_REVALIDATION_DOCUMENTATION.md) | Cache keys, tags, and revalidation points |

---

## References

- [Neon — Connect from Prisma (connection timeouts)](https://neon.com/docs/guides/prisma#connection-timeouts)
- [Neon — Connection latency and timeouts](https://neon.com/docs/connect/connection-latency)
- [Prisma — Neon database guide](https://www.prisma.io/docs/orm/v6/overview/databases/neon)
- [Next.js — Caching without Cache Components (`unstable_cache`)](https://nextjs.org/docs/app/guides/caching-without-cache-components)
- [Vercel community — Prisma + Neon connection issues](https://community.vercel.com/t/vercel-prisma-neon-and-connection-issues/10813)
