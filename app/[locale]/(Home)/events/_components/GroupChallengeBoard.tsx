import Image from 'next/image'
import initTranslation from '@/app/i18n'
import { getPublicGroupChallenge } from '@/lib/actions/challenge/groupChallenge'
import ReferralCodeClaim from '@/app/[locale]/(Home)/events/_components/ReferralCodeClaim'

export async function GroupChallengeBoard({
  eventId,
  locale,
}: {
  eventId: string
  locale: string
}) {
  const challenge = await getPublicGroupChallenge(eventId)
  if (!challenge) return null

  const { t } = await initTranslation(locale, ['event'])

  return (
    <section className="w-full rounded-2xl bg-white p-5 shadow-[0_0_15px_rgba(0,0,0,0.08)] md:p-8">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-neutral-900 md:text-3xl">
          {challenge.title}
        </h2>
        {challenge.description && (
          <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-neutral-600 md:text-base">
            {challenge.description}
          </p>
        )}
        {challenge.endsAtLabel && (
          <p className="mt-3 text-sm font-medium text-rose-800">
            {challenge.ended
              ? t('referral-ended')
              : t('referral-ends', { when: challenge.endsAtLabel })}
          </p>
        )}
        {challenge.referralDiscountPercent > 0 && !challenge.ended && (
          <p className="mt-2 text-sm font-medium text-neutral-800">
            {t('referral-friends-discount', {
              percent: challenge.referralDiscountPercent,
            })}
          </p>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-neutral-50 p-4">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-rose-700">
          {t('referral-how-title')}
        </h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700">
          <li>{t('referral-step-eligible')}</li>
          <li>{t('referral-step-code')}</li>
          {challenge.referralDiscountPercent > 0 && (
            <li>
              {t('referral-step-share', {
                percent: challenge.referralDiscountPercent,
              })}
            </li>
          )}
          <li>
            {challenge.countOwnTickets
              ? t('referral-step-count-with-own')
              : t('referral-step-count')}
          </li>
        </ol>
        <div className="mt-4">
          <ReferralCodeClaim
            eventId={eventId}
            locale={locale}
            ended={challenge.ended}
          />
        </div>
      </div>

      {challenge.rewards.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-rose-700">
            {t('leaderboard-rewards')}
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {challenge.rewards.map((reward) => (
              <div
                key={`${reward.place}-${reward.title}`}
                className="flex w-56 shrink-0 flex-col gap-2 rounded-xl border border-rose-100 bg-rose-50/60 p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D20C36] text-xs font-bold text-white">
                    {reward.place}
                  </span>
                  <span className="font-semibold text-neutral-900">{reward.title}</span>
                </div>
                {reward.imageUrl && (
                  <Image
                    src={reward.imageUrl}
                    alt={reward.title}
                    width={200}
                    height={120}
                    className="h-24 w-full rounded-lg object-cover"
                  />
                )}
                {reward.description && (
                  <p className="text-xs text-neutral-600">{reward.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {challenge.groups.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 px-4 py-6 text-sm text-neutral-600">
          {t('leaderboard-empty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {challenge.groups.map((group) => (
            <li
              key={`${group.rank}-${group.displayName}`}
              className="flex flex-col gap-2 rounded-xl border border-neutral-100 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
                  {group.rank}
                </span>
                <div>
                  <p className="font-semibold text-neutral-900">{group.displayName}</p>
                  <p className="text-xs text-neutral-500">
                    {t('leaderboard-members')}:{' '}
                    {group.members.map((member) => member.displayName).join(', ')}
                  </p>
                </div>
              </div>
              <p className="text-sm font-semibold text-[#D20C36]">
                {t('leaderboard-tickets', { count: group.score })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
