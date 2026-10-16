import Image from 'next/image'
import initTranslation from '@/app/i18n'
import { getPublicEventPrizes } from '@/lib/actions/prize/eventPrizes'
import ScrollToCheckoutButton from '@/app/[locale]/(Home)/events/[eventType]/_component/_concert/ScrollToCheckoutButton'

export async function SponsorPrizeTeaser({ eventId }: { eventId: string }) {
  const prizes = await getPublicEventPrizes(eventId)
  if (prizes.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {prizes.slice(0, 4).map((prize) => (
        <div
          key={prize.id}
          className="flex shrink-0 items-center gap-2 rounded-full border border-rose-100 bg-white py-1 pl-1 pr-3 shadow-sm"
        >
          {prize.imageUrl ? (
            <Image
              src={prize.imageUrl}
              alt={prize.title}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-sm">
              🎁
            </span>
          )}
          <span className="max-w-[140px] truncate text-xs font-semibold text-neutral-800">
            {prize.title}
          </span>
        </div>
      ))}
    </div>
  )
}

export async function SponsorPrizesSection({
  eventId,
  locale,
}: {
  eventId: string
  locale: string
}) {
  const prizes = await getPublicEventPrizes(eventId)
  if (prizes.length === 0) return null

  const { t } = await initTranslation(locale, ['event'])

  return (
    <section className="w-full">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 className="text-2xl font-bold text-neutral-900 md:text-3xl lg:text-4xl">
          {t('prizes-section-title')}
        </h2>
        <ScrollToCheckoutButton text={t('prizes-cta')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {prizes.map((prize) => (
          <article
            key={prize.id}
            className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_15px_rgba(0,0,0,0.08)]"
          >
            <div className="relative h-44 bg-rose-50">
              {prize.imageUrl ? (
                <Image
                  src={prize.imageUrl}
                  alt={prize.title}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl">
                  🎁
                </div>
              )}
              {prize.sponsorLogoUrl && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white/95 px-2 py-1 shadow">
                  <Image
                    src={prize.sponsorLogoUrl}
                    alt={prize.sponsorName || 'Sponsor'}
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full object-contain"
                  />
                  {prize.sponsorName && (
                    <span className="max-w-[140px] truncate pr-1 text-xs font-medium text-neutral-700">
                      {prize.sponsorName}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="text-lg font-semibold text-neutral-900">{prize.title}</h3>
              {prize.description && (
                <p className="text-sm text-neutral-600">{prize.description}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
