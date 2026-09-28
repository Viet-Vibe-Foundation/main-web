# NextAuth OAuth User Creation Error

## Symptom

Signing in with a brand-new Google or Facebook account redirects to the Auth.js
error page:

> Server error  
> There is a problem with the server configuration.  
> Check the server logs for more information.

Existing OAuth accounts can still sign in successfully.

## Root Cause

The Auth.js adapter contract requires the user field:

```ts
emailVerified: Date | null
```

During first-time OAuth sign-in, Auth.js passes `emailVerified` to the Prisma
adapter's `createUser` method. The application's Prisma `User` model uses
`emailVerifiedDate` instead:

```prisma
emailVerifiedDate DateTime?
```

The standard Prisma adapter therefore passed an unknown `emailVerified` field
to `prisma.user.create()`. Prisma rejected the operation, and Auth.js presented
the resulting adapter failure as the generic `Configuration` server error.

This only affected new accounts because returning users do not execute the
adapter's `createUser` path.

## Fix

`auth.ts` wraps the standard Prisma adapter and overrides `createUser` to:

1. Map Auth.js's `emailVerified` value to the Prisma `emailVerifiedDate` field.
2. Assign the default `USER` role.
3. Return `emailVerified` in the adapter response to satisfy the Auth.js
   adapter contract.

Do not edit Auth.js files under `node_modules`; those changes would be
overwritten when dependencies are installed.

The `events.createUser` callback in `auth.config.ts` cannot perform this
translation because it runs only after the adapter has successfully created
the user.

## Verification

After changing the adapter:

```bash
npx tsc --noEmit
```

Test sign-in with a Google or Facebook account that has never previously been
linked to a user in the application database.

## Additional Facebook Consideration

Some Facebook accounts may not return an email address. The application's
`User.email` field is required, so those accounts need separate handling if
Facebook does not provide an email.
