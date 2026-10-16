'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import ExportToExcelButton from '@/components/button/ExportToExcelButton'
import { getEventReferralStats } from '@/lib/actions/referral/referralStats'
import type { ReferralStatRow } from '@/lib/actions/referral/rankReferralStats'

interface ReferralStatsPanelProps {
  eventId: string
}

export default function ReferralStatsPanel({ eventId }: ReferralStatsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<ReferralStatRow[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const stats = await getEventReferralStats(eventId)
        if (cancelled) return
        if (!stats) {
          toast.error('You do not have access to referral stats for this event')
          setRows([])
          return
        }
        setRows(stats)
      } catch (error) {
        console.error(error)
        if (!cancelled) toast.error('Failed to load referral stats')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [eventId])

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-white p-8">
        <p>Loading referral stats...</p>
      </div>
    )
  }

  const top = rows[0]
  const totalReferrals = rows.reduce((sum, row) => sum + row.referralCount, 0)
  const totalTickets = rows.reduce((sum, row) => sum + row.referredTickets, 0)

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Referral stats</h3>
          <p className="text-sm text-muted-foreground">
            {totalReferrals} referral {totalReferrals === 1 ? 'order' : 'orders'} ·{' '}
            {totalTickets} tickets brought in
          </p>
        </div>
        <ExportToExcelButton
          data={rows.map((row) => ({
            Rank: row.rank,
            Name: row.name,
            Email: row.email,
            Code: row.code,
            'Referral orders': row.referralCount,
            'Tickets referred': row.referredTickets,
            'Referred buyers': row.referredBuyers
              .map((buyer) => `${buyer.name} <${buyer.email}> x${buyer.quantity}`)
              .join('; '),
          }))}
          filename={`referrals-${eventId}`}
          sheetName="Referrals"
        />
      </div>

      {top ? (
        <div className="border-b bg-rose-50 px-4 py-3 text-sm text-rose-950">
          Most referrals: <strong>{top.name}</strong> ({top.email}) —{' '}
          {top.referralCount} referral {top.referralCount === 1 ? 'order' : 'orders'},{' '}
          {top.referredTickets} tickets. Code {top.code}.
        </div>
      ) : (
        <p className="px-4 py-8 text-sm text-muted-foreground">
          No successful referrals for this event yet. Counts appear after a friend
          buys a ticket with someone&apos;s invite code.
        </p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="px-4 py-2 font-semibold">#</th>
                <th className="px-4 py-2 font-semibold">Referrer</th>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Referral orders</th>
                <th className="px-4 py-2 font-semibold">Tickets</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.email} className="border-b align-top">
                  <td className="px-4 py-3 font-semibold">{row.rank}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.name}</div>
                    <div className="text-xs text-gray-500">{row.email}</div>
                    {row.referredBuyers.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-gray-600">
                        {row.referredBuyers.map((buyer) => (
                          <li key={`${row.email}-${buyer.email}`}>
                            {buyer.name} · {buyer.email} · {buyer.quantity} ticket
                            {buyer.quantity === 1 ? '' : 's'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                  <td className="px-4 py-3 font-semibold">{row.referralCount}</td>
                  <td className="px-4 py-3">{row.referredTickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
