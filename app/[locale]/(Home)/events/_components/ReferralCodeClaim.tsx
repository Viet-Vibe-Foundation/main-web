'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { claimReferralCode } from '@/lib/actions/referral/claimReferralCode'

interface ReferralCodeClaimProps {
  eventId: string
  locale: string
  ended: boolean
}

export default function ReferralCodeClaim({
  eventId,
  locale,
  ended,
}: ReferralCodeClaimProps) {
  // @ts-ignore: useTranslation will always throw an error for TypeScript
  const { t } = useTranslation('event')
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const claim = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const result = await claimReferralCode(eventId)
      if (!result.ok) {
        const reasons = {
          login: t('referral-login'),
          ineligible: t('referral-ineligible'),
          ended: t('referral-ended'),
          unavailable: t('referral-unavailable'),
        }
        setMessage(reasons[result.reason])
        return
      }
      setCode(result.code)
      setLink(result.link)
      if (result.ended) setMessage(t('referral-ended'))
    } catch (error) {
      console.error(error)
      setMessage(t('referral-unavailable'))
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (status !== 'loading' && !session?.user) {
    return (
      <Button asChild className="bg-[#D20C36] text-white hover:bg-[#b00a2e]">
        <Link href={`/${locale}/signIn`}>{t('referral-login')}</Link>
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {!code && (
        <Button
          type="button"
          onClick={() => void claim()}
          disabled={loading || ended}
          className="w-fit bg-[#D20C36] text-white hover:bg-[#b00a2e]"
        >
          {loading ? t('processing') : t('referral-get-code')}
        </Button>
      )}
      {code && link && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
          <p className="text-sm text-neutral-700">
            {t('invite-code-label')}: <strong className="tracking-wide">{code}</strong>
          </p>
          <p className="mt-1 break-all text-xs text-neutral-500">{link}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void copy()}>
            {copied ? t('invite-copied') : t('invite-copy')}
          </Button>
        </div>
      )}
      {message && <p className="text-sm text-neutral-600">{message}</p>}
    </div>
  )
}
