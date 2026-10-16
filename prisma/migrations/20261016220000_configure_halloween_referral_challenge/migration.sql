-- Configure the Halloween Music Night referral contest on the live event.
-- 5:00 PM Pacific on Oct 25, 2026 is 2026-10-26 00:00:00 UTC.

INSERT INTO "EventGroupChallenge" (
    "id",
    "createdAt",
    "updatedAt",
    "eventId",
    "isEnabled",
    "title",
    "description",
    "rewards",
    "endsAt",
    "referralDiscountPercent",
    "countOwnTickets",
    "performerEmails"
)
SELECT
    'cmhalloweenreferral2026',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    e."id",
    true,
    'VVF Halloween Referral Challenge',
    E'Refer friends and win a bowling night for 4!\n\nGot your ticket to Halloween Music Night 2026: The Hidden Character? Bring your friends. The person with the most successful ticket referrals wins a bowling night for four, sponsored by Grandview Lanes.\n\nThe prize: 2 games of bowling and shoe rentals for up to 4 people. Approximate value: $85 CAD.\n\nHalloween Music Night 2026: The Hidden Character\nSunday, October 25. Doors open at 6 PM.\nMoberly Arts & Cultural Centre, Vancouver.\n19+ event.',
    '[{"place":1,"title":"Bowling night for 4","description":"2 games of bowling and shoe rentals for up to 4 people at Grandview Lanes. Approximate value: $85 CAD.","imageUrl":""}]'::jsonb,
    TIMESTAMP '2026-10-26 00:00:00',
    10,
    false,
    ARRAY[]::TEXT[]
FROM "Event" e
WHERE e."keyName" = 'halloween-musical-night-the-hidden-character'
ON CONFLICT ("eventId") DO UPDATE
SET
    "isEnabled" = EXCLUDED."isEnabled",
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "rewards" = EXCLUDED."rewards",
    "endsAt" = EXCLUDED."endsAt",
    "referralDiscountPercent" = EXCLUDED."referralDiscountPercent",
    "countOwnTickets" = EXCLUDED."countOwnTickets",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "EventPrize" (
    "id",
    "createdAt",
    "updatedAt",
    "eventId",
    "title",
    "description",
    "order",
    "isPublished"
)
SELECT
    'cmhalloweenbowlingprize2026',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    e."id",
    'Bowling night for 4',
    '2 games of bowling and shoe rentals for up to 4 people. Approximate value: $85 CAD. Sponsored by Grandview Lanes.',
    0,
    true
FROM "Event" e
WHERE e."keyName" = 'halloween-musical-night-the-hidden-character'
  AND NOT EXISTS (
      SELECT 1
      FROM "EventPrize" p
      WHERE p."eventId" = e."id"
        AND p."title" = 'Bowling night for 4'
  );
