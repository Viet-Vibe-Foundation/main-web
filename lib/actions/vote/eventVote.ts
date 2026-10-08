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
  votingStartsAt: Date | null
  votingEndsAt: Date | null
  votingStatus: VotingWindowStatus
  isVotingOpen: boolean
  totalVotes: number
  options: PublicVoteOption[]
  ballots: PublicVoteBallot[]
  myBallot: {
    id: string
    optionId: string
    nickname: string | null
  } | null
}

async function findExistingBallot(voteId: string, userId: string | null, deviceToken: string | null) {
  if (userId) {
    const byUser = await prisma.eventVoteBallot.findFirst({
      where: { voteId, userId },
    })
    if (byUser) return byUser
  }
  if (deviceToken) {
    return prisma.eventVoteBallot.findUnique({
      where: {
        voteId_deviceToken: { voteId, deviceToken },
      },
    })
  }
  return null
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
  const existing = await findExistingBallot(vote.id, userId, deviceToken)
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
      isMine: existing?.id === ballot.id,
    })),
    myBallot: existing
      ? {
          id: existing.id,
          optionId: existing.optionId,
          nickname: existing.nickname,
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
  optionId: string
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

  const option = vote.options.find((o) => o.id === input.optionId)
  if (!option) {
    return { success: false as const, error: 'Invalid option' }
  }

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
  const existing = await findExistingBallot(vote.id, userId, deviceToken)

  if (existing) {
    if (!vote.allowChangeVote) {
      return {
        success: false as const,
        error: 'You already voted and changing votes is disabled',
      }
    }

    await prisma.$transaction(async (tx) => {
      // Free the device token if another ballot holds it
      if (existing.deviceToken !== deviceToken) {
        await tx.eventVoteBallot.deleteMany({
          where: {
            voteId: vote.id,
            deviceToken,
            id: { not: existing.id },
          },
        })
      }
      await tx.eventVoteBallot.update({
        where: { id: existing.id },
        data: {
          optionId: option.id,
          nickname: userId ? null : nickname,
          voterEmail: userId ? voterEmail : null,
          userId: userId,
          deviceToken,
        },
      })
    })
    return { success: true as const, changed: true }
  }

  try {
    await prisma.eventVoteBallot.create({
      data: {
        voteId: vote.id,
        optionId: option.id,
        deviceToken,
        userId,
        voterEmail: userId ? voterEmail : null,
        nickname: userId ? null : nickname,
      },
    })
  } catch {
    return {
      success: false as const,
      error: 'Could not save your vote. Please try again.',
    }
  }

  return { success: true as const, changed: false }
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
