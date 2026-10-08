'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import MobileSidebar from './MobileSidebar' // Import the new component

interface SidebarProps {
  locale: string
  userId: string
  user: {
    role: string[]
  }
}

export default function Sidebar({ locale, userId, user }: SidebarProps) {
  // @ts-ignore: useTranslation will always throw an error for TypeScript
  const { t } = useTranslation('profile')
  const searchParams = useSearchParams()
  const currentSection = searchParams.get('section') || 'my-profile'

  const sections = {
    'my-profile': t('my-profile'),
    subscription: t('subscription'),
    'update-profile': t('update-profile'),
    'change-password': t('change-password'),
    'delete-account': t('delete-account'),
    'admin-payment-management': t('payment-management'),
    'admin-email-composition': t('email-composition'),
    'admin-ticket-checkin': t('ticket-checkin'),
    'admin-event-statistics': t('event-manager'),
    'admin-shop-statistics': 'Shop Manager',
    'admin-vvf-finance': 'VVF Finance',
    'privacy-policy': t('privacy-policy'),
    'refund-policy': t('refund-policy'),
  }

  const isAdmin = user.role.includes('ADMIN')
  const isHost = user.role.includes('HOST')
  const isSuperAdmin = user.role.includes('SUPERADMIN')
  const isWriter = user.role.includes('WRITER')
  const isShopOwner = user.role.includes('SHOPOWNER')
  const isAdminOrHostOrSuperAdmin = isAdmin || isHost || isSuperAdmin
  const isWriterOnly =
    isWriter && !isAdmin && !isSuperAdmin && !isHost
  const isShopOwnerOnly =
    isShopOwner && !isAdmin && !isSuperAdmin && !isHost
  const showAdminSection =
    isAdminOrHostOrSuperAdmin || isWriterOnly || isShopOwnerOnly
  const adminNavItems: { key: string; label: string; hostVisible?: boolean }[] =
    [
      { key: 'admin-event-statistics', label: t('event-manager') },
      { key: 'admin-shop-statistics', label: 'Shop Manager' },
      { key: 'admin-vvf-finance', label: 'VVF Finance' },
      { key: 'admin-payment-management', label: t('payment-management') },
      { key: 'admin-ticket-checkin', label: t('ticket-checkin'), hostVisible: true },
      { key: 'admin-email-composition', label: t('email-composition'), hostVisible: true },
    ]

  const visibleAdminNavItems = adminNavItems.filter(
    (item) =>
      isAdmin ||
      isSuperAdmin ||
      (isShopOwner &&
        (item.key === 'admin-shop-statistics' || item.key === 'admin-vvf-finance')) ||
      (isHost && item.hostVisible === true),
  )

  const eventManagementSections = [
    'admin-create-event',
    'admin-all-events',
    'admin-event-categories',
    'admin-event-series',
    'admin-manage-sponsors',
    'admin-edit-event',
  ]
  const [isEventsDropdownOpen, setIsEventsDropdownOpen] = useState(
    eventManagementSections.includes(currentSection)
  )

  const jobManagementSections = [
    'admin-create-job',
    'admin-all-jobs',
    'admin-edit-job',
  ]
  const [isJobsDropdownOpen, setIsJobsDropdownOpen] = useState(
    jobManagementSections.includes(currentSection)
  )

  const shopManagementSections = [
    'admin-create-shop',
    'admin-all-shops',
    'admin-edit-shop',
  ]
  const [isShopsDropdownOpen, setIsShopsDropdownOpen] = useState(
    shopManagementSections.includes(currentSection)
  )

  const postManagementSections = [
    'admin-create-post',
    'admin-all-posts',
    'admin-edit-post',
  ]
  const [isPostsDropdownOpen, setIsPostsDropdownOpen] = useState(
    postManagementSections.includes(currentSection)
  )

  return (
    <div className="relative w-full bg-bgColor-gray100 p-4 md:w-64 md:p-6">
      {/* Desktop Navigation */}
      <div className="hidden md:block">
        <h2 className="text-textColor-black mb-4 text-xl font-semibold">
          {t('acc-setting')}
        </h2>

        <ul className="space-y-4">
          {Object.entries(sections).map(([key, label]) => {
            if (key.includes('admin')) return null
            return (
              <li key={key}>
                <Link
                  href={`/${locale}/profile?section=${key}`}
                  className={`block w-full rounded-lg px-4 py-2 text-left text-lg transition-colors ${
                    currentSection === key
                      ? 'text-textColor-black bg-white font-medium shadow-sm'
                      : 'text-textColor-black hover:bg-bgColor-white'
                  }`}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {showAdminSection && (
          <>
            <div className="my-6 border-b border-bgColor-black"/>
            <h2 className="text-textColor-black mb-4 text-xl font-semibold">
              Admin Section
            </h2>
            <ul className="space-y-4">
              {visibleAdminNavItems.map(({ key, label }) => (
                <li key={key}>
                  <Link
                    href={`/${locale}/profile?section=${key}`}
                    className={`block w-full rounded-lg px-4 py-2 text-left text-lg transition-colors ${
                      currentSection === key
                        ? 'text-textColor-black bg-white font-medium shadow-sm'
                        : 'text-textColor-black hover:bg-bgColor-white'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}

              {/* Manage Events Dropdown */}
              {isAdminOrHostOrSuperAdmin && (
                <li>
                  <button
                    onClick={() => setIsEventsDropdownOpen(!isEventsDropdownOpen)}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-lg transition-colors text-textColor-black hover:bg-bgColor-white"
                  >
                    <span>{t('manage-events')}</span>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        isEventsDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isEventsDropdownOpen && (
                    <ul className="mt-2 space-y-2 pl-4">
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-create-event`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-create-event'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('create-event')}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-all-events`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-all-events'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('view-all-events')}
                        </Link>
                      </li>
                      {(isAdmin || isSuperAdmin) && (
                        <>
                          <li>
                            <Link
                              href={`/${locale}/profile?section=admin-event-categories`}
                              className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                                currentSection === 'admin-event-categories'
                                  ? 'text-textColor-black bg-white font-medium shadow-sm'
                                  : 'text-textColor-black hover:bg-bgColor-white'
                              }`}
                            >
                              {t('create-edit-tags')}
                            </Link>
                          </li>
                          <li>
                            <Link
                              href={`/${locale}/profile?section=admin-event-series`}
                              className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                                currentSection === 'admin-event-series'
                                  ? 'text-textColor-black bg-white font-medium shadow-sm'
                                  : 'text-textColor-black hover:bg-bgColor-white'
                              }`}
                            >
                              {t('create-edit-series')}
                            </Link>
                          </li>
                          <li>
                            <Link
                              href={`/${locale}/profile?section=admin-manage-sponsors`}
                              className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                                currentSection === 'admin-manage-sponsors'
                                  ? 'text-textColor-black bg-white font-medium shadow-sm'
                                  : 'text-textColor-black hover:bg-bgColor-white'
                              }`}
                            >
                              {t('manage-sponsors')}
                            </Link>
                          </li>
                        </>
                      )}
                    </ul>
                  )}
                </li>
              )}

              {/* Manage Jobs Dropdown */}
              {(isAdmin || isSuperAdmin) && (
                <li>
                  <button
                    onClick={() => setIsJobsDropdownOpen(!isJobsDropdownOpen)}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-lg transition-colors text-textColor-black hover:bg-bgColor-white"
                  >
                    <span>{t('manage-jobs')}</span>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        isJobsDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isJobsDropdownOpen && (
                    <ul className="mt-2 space-y-2 pl-4">
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-create-job`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-create-job'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('create-job')}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-all-jobs`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-all-jobs'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('view-all-jobs')}
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>
              )}

              {/* Manage Shops Dropdown */}
              {(isAdmin || isSuperAdmin || isShopOwner) && (
                <li>
                  <button
                    onClick={() => setIsShopsDropdownOpen(!isShopsDropdownOpen)}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-lg transition-colors text-textColor-black hover:bg-bgColor-white"
                  >
                    <span>{t('manage-shops')}</span>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        isShopsDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isShopsDropdownOpen && (
                    <ul className="mt-2 space-y-2 pl-4">
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-create-shop`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-create-shop'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('create-shop')}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-all-shops`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-all-shops'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('view-all-shops')}
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>
              )}

              {/* Manage Posts Dropdown */}
              {(isAdmin || isSuperAdmin || isWriter) && (
                <li>
                  <button
                    onClick={() => setIsPostsDropdownOpen(!isPostsDropdownOpen)}
                    className="flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-lg transition-colors text-textColor-black hover:bg-bgColor-white"
                  >
                    <span>{t('manage-posts')}</span>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        isPostsDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isPostsDropdownOpen && (
                    <ul className="mt-2 space-y-2 pl-4">
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-create-post`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-create-post'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('create-post')}
                        </Link>
                      </li>
                      <li>
                        <Link
                          href={`/${locale}/profile?section=admin-all-posts`}
                          className={`block w-full rounded-lg px-4 py-2 text-left text-base transition-colors ${
                            currentSection === 'admin-all-posts'
                              ? 'text-textColor-black bg-white font-medium shadow-sm'
                              : 'text-textColor-black hover:bg-bgColor-white'
                          }`}
                        >
                          {t('view-all-posts')}
                        </Link>
                      </li>
                    </ul>
                  )}
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {/* Mobile Navigation */}
      <MobileSidebar locale={locale} userId={userId} sections={sections} user={user} />
    </div>
  )
}
