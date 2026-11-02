import { NextResponse } from 'next/server'

const OPENCLAW_INVOKE_URL = 'https://openclaw.k-aithelittlelion.com/tools/invoke'
const AGENT_ID = 'webhook-responder'

const parseJsonSafely = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return { raw }
  }
}

type CachedSession = {
  seenIds: Set<string>
  responses: Array<{ id: string; role: 'assistant'; text: string; timestamp: number }>
}

const responseCache = new Map<string, CachedSession>()

const normalizeName = (name?: string) => {
  if (!name) return 'user'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'user'
  if (parts.length === 1) return parts[0].toLowerCase()
  return `${parts[0]}-${parts[parts.length - 1]}`.toLowerCase()
}

const toHookSessionKey = (email?: string, name?: string) => {
  const safeEmail = (email || 'guest').trim().toLowerCase().replace(/\s+/g, '')
  const safeName = normalizeName(name).replace(/[^a-z0-9-]/g, '-')
  return `hook:webchat:${safeEmail}-${safeName}`
}

const toAgentSessionKey = (hookSessionKey: string) => `agent:${AGENT_ID}:${hookSessionKey}`

const extractText = (content: unknown): string => {
  if (!Array.isArray(content)) return ''
  for (const item of content) {
    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      'text' in item &&
      (item as { type?: string }).type === 'text' &&
      typeof (item as { text?: unknown }).text === 'string'
    ) {
      return (item as { text: string }).text
    }
  }
  return ''
}

export const POST = async (request: Request) => {
  try {
    const requestBody = await request.json()
    const { email, name, sessionKey, sinceTimestamp } = requestBody
    const sinceTs =
      typeof sinceTimestamp === 'number' && Number.isFinite(sinceTimestamp)
        ? sinceTimestamp
        : 0
    const hookSessionKey =
      typeof sessionKey === 'string' && sessionKey.trim()
        ? sessionKey.trim()
        : toHookSessionKey(email, name)
    const agentSessionKey = toAgentSessionKey(hookSessionKey)

    const token = process.env.OPENCLAW_GATEWAY_TOKEN
    if (!token) {
      console.log('[CHAT BOT GET RESPONSES][missingEnv] OPENCLAW_GATEWAY_TOKEN')
      return NextResponse.json(
        { message: 'OPENCLAW_GATEWAY_TOKEN is missing' },
        { status: 500 }
      )
    }

    const bodySet = {
      tool: 'sessions_history',
      action: 'json',
      sessionKey: agentSessionKey,
      args: {
        sessionKey: agentSessionKey,
        includeTools: true,
        limit: 20,
      },
    }
    console.log('[CHAT BOT GET RESPONSES][bodySet]', bodySet)

    const upstreamResponse = await fetch(OPENCLAW_INVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodySet),
    })

    const rawResponse = await upstreamResponse.text()
    const data = parseJsonSafely(rawResponse)
    console.log('[CHAT BOT GET RESPONSES][data]', data)
    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { message: 'Failed to get chatbot responses', details: data },
        { status: upstreamResponse.status }
      )
    }

    const messages = Array.isArray(data?.result?.details?.messages)
      ? data.result.details.messages
      : []

    const cache = responseCache.get(agentSessionKey) || {
      seenIds: new Set<string>(),
      responses: [],
    }

    const newResponses: CachedSession['responses'] = []

    for (const message of messages) {
      if (message?.role !== 'assistant') continue
      const text = extractText(message?.content)
      if (!text) continue
      const messageTimestamp = Number(message?.timestamp || Date.now())

      const fallbackId = `${messageTimestamp}-${text}`
      const messageId =
        message?.__openclaw?.id ||
        message?.responseId ||
        message?.__openclaw?.seq?.toString() ||
        fallbackId

      if (cache.seenIds.has(messageId)) continue
      if (sinceTs > 0 && messageTimestamp < sinceTs) {
        cache.seenIds.add(messageId)
        continue
      }
      cache.seenIds.add(messageId)

      const nextMessage = {
        id: messageId,
        role: 'assistant' as const,
        text,
        timestamp: messageTimestamp,
      }

      cache.responses.push(nextMessage)
      newResponses.push(nextMessage)
    }

    responseCache.set(agentSessionKey, cache)

    if (newResponses.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          sessionKey: hookSessionKey,
          responses: cache.responses,
          timeout: true,
          message: 'TIMEOUT, PLEASE WAIT',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        sessionKey: hookSessionKey,
        responses: cache.responses,
        newResponses,
        timeout: false,
      },
      { status: 200 }
    )
  } catch (error) {
    console.log('[CHAT BOT GET RESPONSES ERROR]', error)
    return NextResponse.json({ message: 'Internal Error' }, { status: 500 })
  }
}
