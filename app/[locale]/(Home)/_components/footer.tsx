// Libraries
import React from 'react'
import initTranslation from '@/app/i18n'
import Image from 'next/image'

// Components
// import Link from 'next/link'
// import { Separator } from '@radix-ui/react-separator'
import CustomIcon from '@/components/icon/CustomIcon'
import Link from 'next/link'

// Main Component
const Footer = async ({ locale }: { locale: string }) => {
  const { t } = await initTranslation(locale, ['homePage', 'common'])

  return (
    <footer className="bg-bgColor-secondary100 py-6 pt-10 px-5 sm:px-12 md:px-[60px] lg:px-[120px]">
      <div className="flex flex-col">
        <div className="flex w-[179px] gap-x-1 pb-5">
          <CustomIcon width={30} height={30} className="self-start" />
          <div className="max-w-[200px] font-bold leading-tight text-textColor-brand900">
            <span className="text-[27px]">VIET VIBE </span>
            <span className="text-[18px]">FOUNDATION</span>
          </div>
        </div>

        <div className="flex gap-x-5 pb-10">
          <a
            href="https://www.facebook.com/profile.php?id=61570910920072"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook Page"
            className="hover:text-textColor-brand600"
          >
            <Image
              src="/icons/facebook-footer.png"
              alt="Facebook"
              width={33}
              height={33}
              className="rounded-full shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-[0_0_25px_rgba(0,0,0,0.15)]"
              unoptimized
            />
          </a>
          <a
            href="https://www.instagram.com/vietvibe.foundation"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram Page"
            className="hover:text-textColor-brand600"
          >
            <Image
              src="/icons/instagram-footer.png"
              alt="Instagram"
              width={33}
              height={33}
              className="rounded-full shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-[0_0_25px_rgba(0,0,0,0.15)]"
              unoptimized
            />
          </a>
        </div>

        <div className="mb-8 md:mb-5 h-[1px] w-full bg-[#2b2b2b]" />

        <div className="flex-col md:flex-row md:justify-between flex items-center text-[16px]">
          <p className="mb-2 md:mb-0">{t('footer-copyright')}</p>
          <div className="flex gap-x-5">
            <Link
              href="/policy"
              className="hover:text-textColor-brand900 hover:underline"
            >
              {t('footer-privacyPolicy')}
            </Link>

            <Link
              href="/policy/refund"
              className="hover:text-textColor-brand900 hover:underline"
            >
              {t('footer-refundPolicy')}
            </Link>

            <Link
              href="/policy"
              className="hover:text-textColor-brand900 hover:underline"
            >
              {t('footer-termsOfService')}
            </Link>
          </div>
        </div>
      </div>

      {/* Old version */}
      {/* <div className="grid grid-cols-[repeat(auto-fit,_minmax(200px,_1fr))] gap-4">
        <div className="pl-6">
          <h5 className="text-xl text-textColor-white">
            {t('pageHeader-footer').toUpperCase()}
          </h5>
          <Separator className="h-[2px] w-[50px] bg-slate-700" />
          <div className="mt-4 flex flex-col gap-y-2">
            {navRoutes.map((route, index) => (
              <Link
                key={index}
                href={route.path}
                className="hover:text-textColor-brand600 hover:underline"
              >
                {t(route.label.toLowerCase() + '-footer')}
              </Link>
            ))}
            <Link
              href="/policy"
              className="hover:text-textColor-brand600 hover:underline"
            >
              {t('policy-footer')}
            </Link>
          </div>
        </div>

        <div>
          <div className="h-full w-full">
            <div className="px-6">
              <h5 className="text-xl text-textColor-white">
                {t('contactUs-footer').toUpperCase()}
              </h5>
              <Separator className="h-[2px] w-[120px] bg-slate-700" />
              <div className="mt-4 flex flex-col gap-y-2 text-sm">
                <p className="text-slate-500">
                    <span className="text-slate-300">
                      {t('phoneNumber-footer')}
                    </span>
                  </p>
                <p>
                  <span>{t('email-footer')}</span>
                </p>
                <p>
                  <span>{t('address-footer')}</span>
                </p>
                <div className="mt-4 flex space-x-4">
                  <a
                    href="https://www.facebook.com/profile.php?id=61570910920072"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook Page"
                    className="hover:text-textColor-brand600"
                  >
                    <SiFacebook className="h-6 w-6" />
                  </a>
                  <a
                    href="https://www.instagram.com/vietvibe.foundation"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram Page"
                    className="hover:text-textColor-brand600"
                  >
                    <SiInstagram className="h-6 w-6" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div> */}
    </footer>
  )
}

export default Footer
