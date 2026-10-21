'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { revalidateTag } from 'next/cache'
import { Role } from '@prisma/client'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'
import {
  getOrCreateVoterDeviceToken,
  readVoterDeviceToken,
} from '@/lib/actions/vote/voterDevice'
import { displayVoterLabel } from '@/lib/actions/vote/maskEmail'
import {
  getVotingWindowStatus,
  isVotingOpen,
  type VotingWindowStatus,
} from '@/lib/actions/vote/votingWindow'
import {
  validateCastSelection,
  validateSelectionLimits,
} from '@/lib/actions/vote/selectionLimits'

export type PublicVoteOption = {
  id: string
  label: string
  position: number
  voteCount: number
}

export type PublicVoteBallot = {
  id: string
  optionId: string
  optionLabel: string
  displayName: string
  createdAt: Date
  isMine: boolean
}

export type PublicEventVote = {
  id: string
  eventId: string
  question: string
  description: string | null
  allowChangeVote: boolean
  minSelections: number
  maxSelections: number
  votingStartsAt: Date | null
  votingEndsAt: Date | null
  votingStatus: VotingWindowStatus
  isVotingOpen: boolean
  totalVotes: number
  options: PublicVoteOption[]
  ballots: PublicVoteBallot[]
  /** Null until this device or account has voted. optionIds are the current picks. */
  mySelections: {
    optionIds: string[]
    nickname: string | null
  } | null
}

async function findVoterBallots(
  voteId: string,
  userId: string | null,
  deviceToken: string | null
) {
  const or: Array<{ userId: string } | { deviceToken: string }> = []
  if (userId) or.push({ userId })
  if (deviceToken) or.push({ deviceToken })
  if (or.length === 0) return []

  return prisma.eventVoteBallot.findMany({
    where: { voteId, OR: or },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getPublicEventVote(
  eventId: string
): Promise<PublicEventVote | null> {
  const vote = await prisma.eventVote.findUnique({
    where: { eventId },
    include: {
      options: { orderBy: { position: 'asc' } },
      ballots: {
        include: {
          option: { select: { id: true, label: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!vote || !vote.isEnabled) return null

  const session = await auth()
  const userId = session?.user?.id ?? null
  const deviceToken = await readVoterDeviceToken()
  const mine = vote.ballots.filter(
    (ballot) =>
      (userId !== null && ballot.userId === userId) ||
      (deviceToken !== null && ballot.deviceToken === deviceToken)
  )
  const mineIds = new Set(mine.map((ballot) => ballot.id))
  const now = new Date()
  const votingStatus = getVotingWindowStatus(
    vote.votingStartsAt,
    vote.votingEndsAt,
    now
  )
  const votingOpen = isVotingOpen(vote.votingStartsAt, vote.votingEndsAt, now)

  const counts = new Map<string, number>()
  for (const option of vote.options) counts.set(option.id, 0)
  for (const ballot of vote.ballots) {
    counts.set(ballot.optionId, (counts.get(ballot.optionId) || 0) + 1)
  }

  return {
    id: vote.id,
    eventId: vote.eventId,
    question: vote.question,
    description: vote.description,
    allowChangeVote: vote.allowChangeVote,
    minSelections: vote.minSelections,
    maxSelections: vote.maxSelections,
    votingStartsAt: vote.votingStartsAt,
    votingEndsAt: vote.votingEndsAt,
    votingStatus,
    isVotingOpen: votingOpen,
    totalVotes: vote.ballots.length,
    options: vote.options.map((option) => ({
      id: option.id,
      label: option.label,
      position: option.position,
      voteCount: counts.get(option.id) || 0,
    })),
    ballots: vote.ballots.map((ballot) => ({
      id: ballot.id,
      optionId: ballot.optionId,
      optionLabel: ballot.option.label,
      displayName: displayVoterLabel(ballot),
      createdAt: ballot.createdAt,
      isMine: mineIds.has(ballot.id),
    })),
    mySelections: mine.length
      ? {
          optionIds: vote.options
            .map((option) => option.id)
            .filter((id) => mine.some((ballot) => ballot.optionId === id)),
          nickname: mine.find((ballot) => ballot.nickname)?.nickname ?? null,
        }
      : null,
  }
}

export async function getEventVoteForAdmin(eventId: string) {
  if (!(await canAccessEventPaymentData(eventId))) {
    return null
  }

  return prisma.eventVote.findUnique({
    where: { eventId },
    include: {
      options: { orderBy: { position: 'asc' } },
      _count: { select: { ballots: true } },
    },
  })
}

export type SaveEventVoteInput = {
  eventId: string
  question: string
  description?: string | null
  isEnabled: boolean
  allowChangeVote: boolean
  minSelections: number
  maxSelections: number
  votingStartsAt?: Date | null
  votingEndsAt?: Date | null
  options: Array<{ id?: string; label: string }>
}

export async function saveEventVote(input: SaveEventVoteInput) {
  if (!(await canAccessEventPaymentData(input.eventId))) {
    return { success: false as const, error: 'Unauthorized' }
  }

  const question = input.question.trim()
  const options = input.options
    .map((o) => ({ id: o.id, label: o.label.trim() }))
    .filter((o) => o.label.length > 0)
  const votingStartsAt = input.votingStartsAt ?? null
  const votingEndsAt = input.votingEndsAt ?? null

  if (!question) {
    return { success: false as const, error: 'Question is required' }
  }
  if (options.length < 2) {
    return {
      success: false as const,
      error: 'Add at least two voting options',
    }
  }
  const limits = validateSelectionLimits(
    input.minSelections,
    input.maxSelections,
    options.length
  )
  if (!limits.ok) {
    return { success: false as const, error: limits.error }
  }
  if (
    votingStartsAt &&
    votingEndsAt &&
    votingStartsAt.getTime() >= votingEndsAt.getTime()
  ) {
    return {
      success: false as const,
      error: 'Voting start must be before voting end',
    }
  }

  const existing = await prisma.eventVote.findUnique({
    where: { eventId: input.eventId },
    include: { options: true },
  })

  if (!existing) {
    await prisma.eventVote.create({
      data: {
        eventId: input.eventId,
        question,
        description: input.description?.trim() || null,
        isEnabled: input.isEnabled,
        allowChangeVote: input.allowChangeVote,
        minSelections: limits.minSelections,
        maxSelections: limits.maxSelections,
        votingStartsAt,
        votingEndsAt,
        options: {
          create: options.map((option, index) => ({
            label: option.label,
            position: index,
          })),
        },
      },
    })
  } else {
    const keepIds = options
      .map((o) => o.id)
      .filter((id): id is string => Boolean(id))

    try {
      await prisma.$transaction(async (tx) => {
        await tx.eventVote.update({
          where: { id: existing.id },
          data: {
            question,
            description: input.description?.trim() || null,
            isEnabled: input.isEnabled,
            allowChangeVote: input.allowChangeVote,
            minSelections: limits.minSelections,
            maxSelections: limits.maxSelections,
            votingStartsAt,
            votingEndsAt,
          },
        })

        // Remove options that were deleted and have no ballots; block delete if ballots exist
        for (const old of existing.options) {
          if (keepIds.includes(old.id)) continue
          const ballotCount = await tx.eventVoteBallot.count({
            where: { optionId: old.id },
          })
          if (ballotCount > 0) {
            throw new Error(
              `Cannot remove option "${old.label}" because it already has votes`
            )
          }
          await tx.eventVoteOption.delete({ where: { id: old.id } })
        }

        for (let index = 0; index < options.length; index++) {
          const option = options[index]!
          if (option.id) {
            await tx.eventVoteOption.update({
              where: { id: option.id },
              data: { label: option.label, position: index },
            })
          } else {
            await tx.eventVoteOption.create({
              data: {
                voteId: existing.id,
                label: option.label,
                position: index,
              },
            })
          }
        }
      })
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to save vote tool',
      }
    }
  }

  revalidateTag('events')
  return { success: true as const }
}

export type CastVoteInput = {
  eventId: string
  optionIds: string[]
  /** Guest nickname when not logged in */
  nickname?: string
}

export async function castEventVote(input: CastVoteInput) {
  const vote = await prisma.eventVote.findUnique({
    where: { eventId: input.eventId },
    include: { options: true },
  })

  if (!vote || !vote.isEnabled) {
    return { success: false as const, error: 'Voting is not available' }
  }

  if (!isVotingOpen(vote.votingStartsAt, vote.votingEndsAt)) {
    const status = getVotingWindowStatus(vote.votingStartsAt, vote.votingEndsAt)
    return {
      success: false as const,
      error:
        status === 'upcoming'
          ? 'Voting has not started yet'
          : 'Voting has ended',
    }
  }

  const selection = validateCastSelection(
    input.optionIds,
    vote.options.map((option) => option.id),
    vote.minSelections,
    vote.maxSelections
  )
  if (!selection.ok) {
    return { success: false as const, error: selection.error }
  }
  const optionIds = selection.optionIds

  const session = await auth()
  const userId = session?.user?.id ?? null
  const voterEmail = session?.user?.email?.trim() || null
  const nickname = input.nickname?.trim() || null

  if (!userId && !nickname) {
    return {
      success: false as const,
      error: 'Enter a nickname or sign in to vote',
    }
  }
  if (nickname && nickname.length > 40) {
    return { success: false as const, error: 'Nickname is too long' }
  }

  const { token: deviceToken } = await getOrCreateVoterDeviceToken()
  const existing = await findVoterBallots(vote.id, userId, deviceToken)

  if (existing.length > 0 && !vote.allowChangeVote) {
    return {
      success: false as const,
      error: 'You already voted and changing votes is disabled',
    }
  }

  const wanted = new Set(optionIds)
  const byOption = new Map<string, typeof existing>()
  for (const ballot of existing) {
    const rows = byOption.get(ballot.optionId) ?? []
    rows.push(ballot)
    byOption.set(ballot.optionId, rows)
  }

  const toDelete: string[] = []
  const toKeep: typeof existing = []
  for (const ballot of existing) {
    if (!wanted.has(ballot.optionId)) toDelete.push(ballot.id)
  }
  for (const optionId of optionIds) {
    const rows = byOption.get(optionId) ?? []
    if (rows.length === 0) continue
    toKeep.push(rows[0]!)
    for (const extra of rows.slice(1)) toDelete.push(extra.id)
  }
  const keptOptionIds = new Set(toKeep.map((ballot) => ballot.optionId))

  try {
    await prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        await tx.eventVoteBallot.deleteMany({
          where: { id: { in: toDelete } },
        })
      }
      for (const ballot of toKeep) {
        await tx.eventVoteBallot.update({
          where: { id: ballot.id },
          data: {
            nickname: userId ? null : nickname,
            voterEmail: userId ? voterEmail : null,
            userId,
            deviceToken,
          },
        })
      }
      const toCreate = optionIds.filter((id) => !keptOptionIds.has(id))
      if (toCreate.length > 0) {
        await tx.eventVoteBallot.createMany({
          data: toCreate.map((optionId) => ({
            voteId: vote.id,
            optionId,
            deviceToken,
            userId,
            voterEmail: userId ? voterEmail : null,
            nickname: userId ? null : nickname,
          })),
        })
      }
    })
  } catch {
    return {
      success: false as const,
      error: 'Could not save your vote. Please try again.',
    }
  }

  return { success: true as const, changed: existing.length > 0 }
}

export async function deleteEventVote(eventId: string) {
  const session = await auth()
  const roles = (session?.user?.role ?? []) as Role[]
  const canAdmin =
    roles.includes(Role.ADMIN) || roles.includes(Role.SUPERADMIN)
  if (!canAdmin && !(await canAccessEventPaymentData(eventId))) {
    return { success: false as const, error: 'Unauthorized' }
  }

  await prisma.eventVote.deleteMany({ where: { eventId } })
  revalidateTag('events')
  return { success: true as const }
}
