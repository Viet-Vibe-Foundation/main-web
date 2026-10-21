-- AlterTable
ALTER TABLE "EventVote" ADD COLUMN "minSelections" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EventVote" ADD COLUMN "maxSelections" INTEGER NOT NULL DEFAULT 1;

-- A voter may now hold one ballot row per selected option
DROP INDEX "EventVoteBallot_voteId_deviceToken_key";
CREATE UNIQUE INDEX "EventVoteBallot_voteId_deviceToken_optionId_key" ON "EventVoteBallot"("voteId", "deviceToken", "optionId");
