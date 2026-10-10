-- CreateTable
CREATE TABLE "IssuedTicket" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "qrToken" TEXT NOT NULL,
    "seatLabel" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "paymentId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTicketId" TEXT,

    CONSTRAINT "IssuedTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssuedTicket_qrToken_key" ON "IssuedTicket"("qrToken");

-- CreateIndex
CREATE INDEX "IssuedTicket_eventId_idx" ON "IssuedTicket"("eventId");

-- CreateIndex
CREATE INDEX "IssuedTicket_paymentId_idx" ON "IssuedTicket"("paymentId");

-- CreateIndex
CREATE INDEX "IssuedTicket_qrToken_idx" ON "IssuedTicket"("qrToken");

-- CreateIndex
CREATE INDEX "IssuedTicket_checkedInAt_idx" ON "IssuedTicket"("checkedInAt");

-- AddForeignKey
ALTER TABLE "IssuedTicket" ADD CONSTRAINT "IssuedTicket_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedTicket" ADD CONSTRAINT "IssuedTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedTicket" ADD CONSTRAINT "IssuedTicket_eventTicketId_fkey" FOREIGN KEY ("eventTicketId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedTicket" ADD CONSTRAINT "IssuedTicket_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
