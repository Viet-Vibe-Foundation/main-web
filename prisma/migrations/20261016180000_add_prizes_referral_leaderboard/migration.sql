-- AlterTable
ALTER TABLE "CheckoutSessionData" ADD COLUMN "referralCode" TEXT;

-- CreateTable
CREATE TABLE "EventPrize" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "sponsorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGroupChallenge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL DEFAULT 'Group Challenge',
    "description" TEXT,
    "rewards" JSONB,

    CONSTRAINT "EventGroupChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReferral" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT,
    "userId" TEXT,
    "paymentId" TEXT,

    CONSTRAINT "TicketReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReferralUse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referralId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TicketReferralUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventGroupChallenge_eventId_key" ON "EventGroupChallenge"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReferral_code_key" ON "TicketReferral"("code");

-- CreateIndex
CREATE INDEX "EventPrize_eventId_idx" ON "EventPrize"("eventId");

-- CreateIndex
CREATE INDEX "EventPrize_sponsorId_idx" ON "EventPrize"("sponsorId");

-- CreateIndex
CREATE INDEX "TicketReferral_eventId_idx" ON "TicketReferral"("eventId");

-- CreateIndex
CREATE INDEX "TicketReferral_code_idx" ON "TicketReferral"("code");

-- CreateIndex
CREATE INDEX "TicketReferral_userId_idx" ON "TicketReferral"("userId");

-- CreateIndex
CREATE INDEX "TicketReferral_paymentId_idx" ON "TicketReferral"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReferral_eventId_ownerEmail_key" ON "TicketReferral"("eventId", "ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReferralUse_paymentId_key" ON "TicketReferralUse"("paymentId");

-- CreateIndex
CREATE INDEX "TicketReferralUse_referralId_idx" ON "TicketReferralUse"("referralId");

-- AddForeignKey
ALTER TABLE "EventPrize" ADD CONSTRAINT "EventPrize_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPrize" ADD CONSTRAINT "EventPrize_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "EventSponsor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGroupChallenge" ADD CONSTRAINT "EventGroupChallenge_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReferral" ADD CONSTRAINT "TicketReferral_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReferral" ADD CONSTRAINT "TicketReferral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReferral" ADD CONSTRAINT "TicketReferral_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReferralUse" ADD CONSTRAINT "TicketReferralUse_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "TicketReferral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReferralUse" ADD CONSTRAINT "TicketReferralUse_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
