import { NextResponse } from 'next/server'

const OPENCLAW_HOOK_URL = 'https://openclaw.k-aithelittlelion.com/hooks/agent'

const parseJsonSafely = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return { raw }
  }
}

const normalizeName = (name?: string) => {
  if (!name) return 'user'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'user'
  if (parts.length === 1) return parts[0].toLowerCase()
  return `${parts[0]}-${parts[parts.length - 1]}`.toLowerCase()
}

const toSessionKey = (email?: string, name?: string) => {
  const safeEmail = (email || 'guest').trim().toLowerCase().replace(/\s+/g, '')
  const safeName = normalizeName(name).replace(/[^a-z0-9-]/g, '-')
  return `hook:webchat:${safeEmail}-${safeName}`
}

export const POST = async (request: Request) => {
  try {
    const requestBody = await request.json()
    const { message, email, name, clearConversation } = requestBody

    if (!clearConversation && (!message || typeof message !== 'string')) {
      return NextResponse.json({ message: 'message is required' }, { status: 400 })
    }

    const token = process.env.OPENCLAW_HOOK_TOKEN
    if (!token) {
      console.log('[CHAT BOT SEND MESSAGE][missingEnv] OPENCLAW_HOOK_TOKEN')
      return NextResponse.json(
        { message: 'OPENCLAW_HOOK_TOKEN is missing' },
        { status: 500 }
      )
    }

    const sessionKey = toSessionKey(email, name)

    const bodySet = clearConversation
      ? {
          agentId: 'webhook-responder',
          sessionKey,
          sessionMode: 'isolated',
          message: 'This message is just to start the session. Do not say or return any response',
          wakeMode: 'now',
          deliver: false,
        }
      : {
          agentId: 'webhook-responder',
          sessionKey,
          sessionMode: 'persistent',
          message: message.trim(),
          wakeMode: 'now',
          deliver: false,
        }

    const upstreamResponse = await fetch(OPENCLAW_HOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bodySet),
    })

    const rawResponse = await upstreamResponse.text()
    const data = parseJsonSafely(rawResponse)

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { message: 'Failed to send chatbot message', details: data },
        { status: upstreamResponse.status }
      )
    }

    return NextResponse.json({ ok: true, sessionKey, data }, { status: 200 })
  } catch (error) {
    console.log('[CHAT BOT SEND MESSAGE ERROR]', error)
    return NextResponse.json({ message: 'Internal Error' }, { status: 500 })
  }
}
