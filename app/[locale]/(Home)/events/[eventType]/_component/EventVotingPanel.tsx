'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Vote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  castEventVote,
  getPublicEventVote,
  type PublicEventVote,
} from '@/lib/actions/vote/eventVote'
import { formatVotingWindowLabel } from '@/lib/actions/vote/votingWindow'

interface EventVotingPanelProps {
  eventId: string
  locale: string
  isLoggedIn: boolean
  userEmail?: string | null
}

const RESULTS_POLL_MS = 10000

export default function EventVotingPanel({
  eventId,
  locale,
  isLoggedIn,
  userEmail,
}: EventVotingPanelProps) {
  const [vote, setVote] = useState<PublicEventVote | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState<string>('')
  const [nickname, setNickname] = useState('')
  const [mode, setMode] = useState<'account' | 'nickname'>(
    isLoggedIn ? 'account' : 'nickname'
  )

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await getPublicEventVote(eventId)
      setVote(data)
      if (data?.myBallot) {
        setSelectedOptionId((prev) => prev || data.myBallot!.optionId)
        if (data.myBallot.nickname) {
          setNickname((prev) => prev || data.myBallot!.nickname || '')
          setMode('nickname')
        }
      }
    } catch (error) {
      console.error(error)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    void reload(false)
  }, [reload])

  // Keep public results realtime while the panel is mounted
  useEffect(() => {
    if (!vote) return
    const timer = setInterval(() => {
      void reload(true)
    }, RESULTS_POLL_MS)
    return () => clearInterval(timer)
  }, [vote?.id, reload])

  if (loading) {
    return (
      <div className="flex w-full items-center justify-center rounded-2xl bg-white p-8 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!vote) return null

  const alreadyVoted = Boolean(vote.myBallot)
  const votingOpen = vote.isVotingOpen
  const canSubmit =
    votingOpen &&
    selectedOptionId &&
    (mode === 'account' ? isLoggedIn : nickname.trim().length > 0) &&
    (!alreadyVoted || vote.allowChangeVote)

  const statusMessage =
    vote.votingStatus === 'upcoming'
      ? 'Voting has not started yet. Results below update live.'
      : vote.votingStatus === 'closed'
        ? 'Voting has ended. Live results remain visible.'
        : alreadyVoted
          ? vote.allowChangeVote
            ? 'You already voted — you can change it while voting is open.'
            : 'You already voted.'
          : 'Cast your vote'

  const onSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const result = await castEventVote({
        eventId,
        optionId: selectedOptionId,
        nickname: mode === 'nickname' ? nickname.trim() : undefined,
      })
      if (!result.success) {
        toast.error(result.error || 'Vote failed')
        return
      }
      toast.success(result.changed ? 'Vote updated' : 'Vote submitted')
      await reload(true)
    } catch (error) {
      console.error(error)
      toast.error('Vote failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-full bg-red-50 p-2 text-red-600">
          <Vote className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold md:text-2xl">Community vote</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                votingOpen
                  ? 'bg-green-100 text-green-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {votingOpen ? 'Voting open' : 'Voting closed'}
            </span>
          </div>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {vote.question}
          </p>
          {vote.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {vote.description}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Voting window:{' '}
            {formatVotingWindowLabel(vote.votingStartsAt, vote.votingEndsAt)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-700">{statusMessage}</p>

          <div className="space-y-2">
            {vote.options.map((option) => {
              const selected = selectedOptionId === option.id
              const pct =
                vote.totalVotes > 0
                  ? Math.round((option.voteCount / vote.totalVotes) * 100)
                  : 0
              const disabled =
                !votingOpen || (alreadyVoted && !vote.allowChangeVote)
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedOptionId(option.id)}
                  className={`relative w-full overflow-hidden rounded-lg border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-slate-200 hover:border-slate-300'
                  } ${disabled ? 'cursor-default opacity-90' : ''}`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-red-50"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {selected && (
                        <CheckCircle2 className="mr-2 inline h-4 w-4 text-red-600" />
                      )}
                      {option.label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {option.voteCount} · {pct}%
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {votingOpen && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'account' ? 'default' : 'outline'}
                  onClick={() => setMode('account')}
                >
                  Vote logged in
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'nickname' ? 'default' : 'outline'}
                  onClick={() => setMode('nickname')}
                >
                  Vote with nickname
                </Button>
              </div>

              {mode === 'account' ? (
                isLoggedIn ? (
                  <p className="text-sm text-muted-foreground">
                    Voting as{' '}
                    <span className="font-medium text-slate-800">
                      {userEmail || 'your account'}
                    </span>
                    . Your email will appear partially masked in public results.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <Link
                      href={`/${locale}/signIn`}
                      className="text-red-700 underline"
                    >
                      Sign in
                    </Link>{' '}
                    to vote with your account, or switch to nickname.
                  </p>
                )
              ) : (
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Your nickname"
                  maxLength={40}
                  disabled={alreadyVoted && !vote.allowChangeVote}
                />
              )}

              <Button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={() => void onSubmit()}
              >
                {submitting
                  ? 'Submitting…'
                  : alreadyVoted
                    ? 'Update vote'
                    : 'Submit vote'}
              </Button>
              <p className="text-xs text-muted-foreground">
                One vote per device and per account.
                {!vote.allowChangeVote &&
                  ' Changing votes is disabled for this poll.'}
              </p>
            </>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Live results ({vote.totalVotes})
          </h3>
          {vote.ballots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No votes yet — be first!
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 p-3">
              {vote.ballots.map((ballot) => (
                <li
                  key={ballot.id}
                  className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm ${
                    ballot.isMine ? 'bg-white shadow-sm' : ''
                  }`}
                >
                  <span className="font-medium text-slate-800">
                    {ballot.displayName}
                    {ballot.isMine ? ' (you)' : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {ballot.optionLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Results refresh automatically every few seconds.
          </p>
        </div>
      </div>
    </section>
  )
}
