-- CreateTable
CREATE TABLE "EventVote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowChangeVote" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVoteOption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voteId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventVoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVoteBallot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voteId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "userId" TEXT,
    "voterEmail" TEXT,
    "nickname" TEXT,

    CONSTRAINT "EventVoteBallot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventVote_eventId_key" ON "EventVote"("eventId");

-- CreateIndex
CREATE INDEX "EventVoteOption_voteId_idx" ON "EventVoteOption"("voteId");

-- CreateIndex
CREATE INDEX "EventVoteBallot_voteId_idx" ON "EventVoteBallot"("voteId");

-- CreateIndex
CREATE INDEX "EventVoteBallot_optionId_idx" ON "EventVoteBallot"("optionId");

-- CreateIndex
CREATE INDEX "EventVoteBallot_userId_idx" ON "EventVoteBallot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVoteBallot_voteId_deviceToken_key" ON "EventVoteBallot"("voteId", "deviceToken");

-- AddForeignKey
ALTER TABLE "EventVote" ADD CONSTRAINT "EventVote_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVoteOption" ADD CONSTRAINT "EventVoteOption_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "EventVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVoteBallot" ADD CONSTRAINT "EventVoteBallot_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "EventVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVoteBallot" ADD CONSTRAINT "EventVoteBallot_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "EventVoteOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVoteBallot" ADD CONSTRAINT "EventVoteBallot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
