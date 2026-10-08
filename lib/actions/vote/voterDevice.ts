import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'

export const VOTER_DEVICE_COOKIE = 'vvf_voter_device'

export function createVoterDeviceToken(): string {
  return `vd_${randomBytes(24).toString('base64url')}`
}

export async function getOrCreateVoterDeviceToken(): Promise<{
  token: string
  isNew: boolean
}> {
  const jar = await cookies()
  const existing = jar.get(VOTER_DEVICE_COOKIE)?.value?.trim()
  if (existing) {
    return { token: existing, isNew: false }
  }

  const token = createVoterDeviceToken()
  jar.set(VOTER_DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 400, // ~400 days
  })
  return { token, isNew: true }
}

export async function readVoterDeviceToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(VOTER_DEVICE_COOKIE)?.value?.trim() || null
}
