'use server'

import { prisma } from '@/lib/db'
import { revalidateTag } from 'next/cache'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'

export type PublicEventPrize = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  sponsorName: string | null
  sponsorLogoUrl: string | null
  sponsorUrl: string | null
}

export type AdminEventPrize = {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  sponsorId: string | null
  order: number
  isPublished: boolean
}

export type PrizeSponsorOption = {
  id: string
  name: string
  imgUrl: string
}

function cleanHttpUrl(value?: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

export async function getPublicEventPrizes(
  eventId: string
): Promise<PublicEventPrize[]> {
  const prizes = await prisma.eventPrize.findMany({
    where: { eventId, isPublished: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    include: {
      sponsor: {
        select: { name: true, imgUrl: true, url: true },
      },
    },
  })

  return prizes.map((prize) => ({
    id: prize.id,
    title: prize.title,
    description: prize.description,
    imageUrl: prize.imageUrl,
    sponsorName: prize.sponsor?.name ?? null,
    sponsorLogoUrl: prize.sponsor?.imgUrl ?? null,
    sponsorUrl: prize.sponsor?.url ?? null,
  }))
}

export async function getEventPrizeAdminState(eventId: string): Promise<{
  prizes: AdminEventPrize[]
  sponsors: PrizeSponsorOption[]
} | null> {
  if (!(await canAccessEventPaymentData(eventId))) return null

  const [prizes, links] = await Promise.all([
    prisma.eventPrize.findMany({
      where: { eventId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.sponsorOnEvent.findMany({
      where: { eventId },
      include: { sponsor: { select: { id: true, name: true, imgUrl: true } } },
      orderBy: [{ tier: 'asc' }, { order: 'asc' }],
    }),
  ])

  return {
    prizes: prizes.map((prize) => ({
      id: prize.id,
      title: prize.title,
      description: prize.description,
      imageUrl: prize.imageUrl,
      sponsorId: prize.sponsorId,
      order: prize.order,
      isPublished: prize.isPublished,
    })),
    sponsors: links.map((link) => ({
      id: link.sponsor.id,
      name: link.sponsor.name,
      imgUrl: link.sponsor.imgUrl,
    })),
  }
}

export async function saveEventPrize(input: {
  eventId: string
  id?: string
  title: string
  description?: string
  imageUrl?: string
  sponsorId?: string
  order?: number
  isPublished?: boolean
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await canAccessEventPaymentData(input.eventId))) {
    return { ok: false, error: 'You do not have access to this event' }
  }

  const title = input.title.trim()
  if (!title || title.length > 120) {
    return { ok: false, error: 'Prize title is required (max 120 characters)' }
  }

  const description = input.description?.trim() || null
  if (description && description.length > 800) {
    return { ok: false, error: 'Description is too long' }
  }

  const imageUrl = cleanHttpUrl(input.imageUrl)
  if (input.imageUrl?.trim() && !imageUrl) {
    return { ok: false, error: 'Prize image must be an http(s) URL' }
  }

  const sponsorId = input.sponsorId?.trim() || null
  if (sponsorId) {
    const link = await prisma.sponsorOnEvent.findUnique({
      where: {
        eventId_sponsorId: { eventId: input.eventId, sponsorId },
      },
      select: { id: true },
    })
    if (!link) {
      return { ok: false, error: 'Choose a sponsor already linked to this event' }
    }
  }

  const order = Number.isFinite(input.order) ? Math.max(0, Math.floor(input.order!)) : 0
  const data = {
    title,
    description,
    imageUrl,
    sponsorId,
    order,
    isPublished: input.isPublished !== false,
  }

  if (input.id) {
    const existing = await prisma.eventPrize.findFirst({
      where: { id: input.id, eventId: input.eventId },
      select: { id: true },
    })
    if (!existing) return { ok: false, error: 'Prize not found' }
  }

  const saved = input.id
    ? await prisma.eventPrize.update({
        where: { id: input.id },
        data,
      })
    : await prisma.eventPrize.create({
        data: { ...data, eventId: input.eventId },
      })

  revalidateTag('events')
  return { ok: true, id: saved.id }
}

export async function deleteEventPrize(
  eventId: string,
  prizeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await canAccessEventPaymentData(eventId))) {
    return { ok: false, error: 'You do not have access to this event' }
  }

  await prisma.eventPrize.deleteMany({
    where: { id: prizeId, eventId },
  })
  revalidateTag('events')
  return { ok: true }
}
