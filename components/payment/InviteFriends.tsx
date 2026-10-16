'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface InviteFriendsProps {
  code: string
  link: string
}

export default function InviteFriends({ code, link }: InviteFriendsProps) {
  // @ts-ignore: useTranslation will always throw an error for typescript
  const { t } = useTranslation('event')
  const [copied, setCopied] = useState(false)

  const share = async () => {
    const payload = {
      title: t('invite-friends'),
      text: t('invite-hint'),
      url: link,
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload)
        return
      }
    } catch {
      // The visitor dismissed the share sheet. Copying is still available.
    }
    await copyLink()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mt-6 w-full max-w-xl rounded-2xl border border-rose-100 bg-rose-50 px-5 py-5 text-left">
      <p className="text-lg font-semibold text-neutral-900">{t('invite-friends')}</p>
      <p className="mt-1 text-sm text-neutral-600">{t('invite-hint')}</p>
      <p className="mt-3 text-sm text-neutral-800">
        {t('invite-code-label')}: <strong className="tracking-wide">{code}</strong>
      </p>
      <p className="mt-1 break-all text-xs text-neutral-500">{link}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => void share()}
          className="bg-[#D20C36] text-white hover:bg-[#b00a2e]"
        >
          {t('invite-friends')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyLink()}>
          {copied ? t('invite-copied') : t('invite-copy')}
        </Button>
      </div>
    </div>
  )
}
