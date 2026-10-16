'use client'

import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useSession } from 'next-auth/react'
import '@/lib/ui/css/lineAnimation.css'
import InviteFriends from '@/components/payment/InviteFriends'

interface PaymentSuccessProps {
  title: string
  locale: string
  translationWorkspaces: string[]
  isGuestCheckout?: boolean
  referralCode?: string | null
  referralLink?: string | null
}

const PAYMENT_SUCCESS_IMAGE =
  'https://drive.google.com/thumbnail?id=1rq8yi8jxSDNPSkzUoh4__dsuCrhz1DnR'

const PaymentSuccess = ({
  title,
  locale,
  translationWorkspaces,
  isGuestCheckout = false,
  referralCode,
  referralLink,
}: PaymentSuccessProps) => {
  // @ts-ignore: useTranslation will always throw an error for typescript
  const { t } = useTranslation(translationWorkspaces)
  const { data: session, status } = useSession()

  // Show loading state while checking session (only if not already determined as guest)
  if (!isGuestCheckout && status === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center dark:bg-neutral-900">
        <p className="text-lg text-neutral-700 dark:text-neutral-300">
          Loading...
        </p>
      </div>
    )
  }

  const userName = session?.user?.name || ''
  const userEmail = session?.user?.email || ''

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center dark:bg-neutral-900">
      <div className="relative flex w-full max-w-md justify-center overflow-hidden rounded-2xl">
        <Image
          src={PAYMENT_SUCCESS_IMAGE}
          alt="Payment success background"
          width={1200}
          height={900}
          className="mx-auto w-[400px] object-contain"
          sizes="(min-width: 768px) 24rem, 80vw"
          priority
        />
        <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 mt-32">
          <svg
            className="h-20 w-20 text-green-500"
            viewBox="0 0 52 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="26"
              cy="26"
              r="25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="stroke-current"
            />
            <path
              d="M14 27l7 7 17-17"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="checkmark-path"
            />
          </svg>

          <h1 className="mb-2 text-2xl font-bold text-green-600">
            {t('paymentSuccess-header')}
          </h1>
        </div>
      </div>

      {/* Message */}
      <p className="max-w-xl text-lg text-neutral-700 dark:text-neutral-300">
        {t('paymentSuccess-text')} <strong>{title}</strong>
      </p>
      {isGuestCheckout ? (
        <p className="max-w-xl text-lg text-neutral-700 dark:text-neutral-300">
          {t('paymentSuccess-guest-email')}
        </p>
      ) : (
        userEmail && (
          <p className="max-w-xl text-lg text-neutral-700 dark:text-neutral-300">
            {t('paymentSuccess-text2')} <strong>{userEmail}</strong>
          </p>
        )
      )}
      {!isGuestCheckout && userName && (
        <p className="max-w-xl text-lg text-neutral-700 dark:text-neutral-300">
          {t('paymentSuccess-profile-text')}{' '}
          <Link
            href={`/profile`}
            className="text-textColor-blue underline"
          >
            {t('paymentSuccess-profile-link')}
          </Link>
          .
        </p>
      )}


      <p className="max-w-xl text-lg text-neutral-700 dark:text-neutral-300">
        {t('paymentSuccess-closing')}
      </p>

      {referralCode && referralLink && (
        <InviteFriends code={referralCode} link={referralLink} />
      )}

      <p className="max-w-xl text-left text-sm text-neutral-600 dark:text-neutral-400 italic pt-2">
        <strong>*Note:</strong> If you make a <strong>group purchase</strong>, a
        copy of the ticket along with the form will be sent to{' '}
        <strong>each person</strong>.{' '}
        <strong>
          Please notify other persons in your group to fill out this form
        </strong>
        , as this is <strong>required</strong> for us to make better preparation
        for the event. Thank you!
      </p>      
    </div>
  )
}

export default PaymentSuccess
