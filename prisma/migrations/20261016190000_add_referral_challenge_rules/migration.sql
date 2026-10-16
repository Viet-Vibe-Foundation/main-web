-- AlterTable
ALTER TABLE "EventGroupChallenge"
ADD COLUMN "endsAt" TIMESTAMP(3),
ADD COLUMN "referralDiscountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "countOwnTickets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "performerEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
