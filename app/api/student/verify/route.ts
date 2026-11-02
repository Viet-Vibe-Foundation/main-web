import { createToken } from '@/lib/actions/token/tokenFunctions'
import { sendVerificationEmail } from '@/lib/actions/email/sendVerificationEmail'
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

type RouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string
            text?: string
          }>
    }
  }>
}

const ROUTER_MODEL = 'codex-gemini-VVF'
const ROUTER_ENDPOINT = 'https://9router.k-aithelittlelion.com/v1/chat/completions'
const INVALID_EDU_EMAIL_MESSAGE =
  'We cannot verify that your edu email is valid, please contact VVF technical team at tech@vietvibe.org, we will reply to you in 24hrs.'

function buildEduEmailPrompt(email: string, schoolName: string) {
  return `You are validating whether an input email is a valid educational institution email for a specific school.

Input email: ${email}
Input school name: ${schoolName}

Apply ALL rules below strictly:
- Has exactly one @
- Has text before and after @
- No spaces
- Domain has at least one dot
- Local part is not longer than 64 characters
- Full email is not longer than 254-255 characters
- Domain only uses valid domain characters: letters, numbers, hyphens, dots
- Domain labels do not start or end with hyphen
- Accept only if the domain has valid MX records.
- The domain should belong to an eligible institution
- Must belong to a verified educational institution domain.
- If still not sure, you can use https://verifymail.io/email/${email} to verify the email (check for disposable field, matching domain name, etc.).
- The email should be from the input school name (this step does not need to be strict, unless you find any evidence that the email is not completely from the input school name).

Return only one word:
- True (only if the email is a valid educational institution email and match the input school name)
- False

No markdown. No explanation.`
}

async function call9Router({ apiKey, prompt }: { apiKey: string; prompt: string }) {
  return fetch(ROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      stream: false,
    }),
  })
}

async function verifyEduEmail(email: string, schoolName: string) {
  const routerApiKey = process.env.NINE_ROUTER_API_KEY
  if (!routerApiKey) {
    console.error('NINE_ROUTER_API_KEY is missing')
    return { ok: false as const, status: 500, message: 'Service unavailable.' }
  }

  const prompt = buildEduEmailPrompt(email, schoolName)
  const routerResponse = await call9Router({ apiKey: routerApiKey, prompt })

  if (!routerResponse.ok) {
    const errorText = await routerResponse.text()
    console.error('9router request failed for edu email validation', errorText)
    return { ok: false as const, status: 502, message: 'Failed to validate email.' }
  }

  const routerData = (await routerResponse.json()) as RouterChatCompletionResponse
  const rawContent = routerData.choices?.[0]?.message?.content
  const modelText =
    typeof rawContent === 'string'
      ? rawContent
      : rawContent?.find((part) => part.type === 'text')?.text

  if (!modelText) {
    return {
      ok: false as const,
      status: 502,
      message: 'Invalid validation response from model.',
    }
  }

  const normalizedResult = modelText.trim().toLowerCase()
  if (normalizedResult !== 'true' && normalizedResult !== 'false') {
    return {
      ok: false as const,
      status: 502,
      message: 'Model did not return a valid True/False result.',
    }
  }

  return { ok: true as const, isValidEduEmail: normalizedResult === 'true' }
}

export const POST = async (req: NextRequest) => {
  try {
    const session = await auth()
    const sessionEmail = session?.user?.email
    const sessionName = session?.user?.name

    if (!sessionEmail) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { eduEmail, schoolName } = await req.json()
    if (!eduEmail || typeof eduEmail !== 'string') {
      return NextResponse.json({ message: 'Edu email is required.' }, { status: 400 })
    }

    if (!schoolName || typeof schoolName !== 'string') {
      return NextResponse.json(
        { message: 'School name is required.' },
        { status: 400 }
      )
    }

    const normalizedEduEmail = eduEmail.trim().toLowerCase()

    const clientIp = getClientIp(req.headers.get('x-forwarded-for'))
    const verificationLimit = checkRateLimit({
      key: `student-verify:${clientIp}:${sessionEmail}`,
      limit: 5,
      windowMs: 60 * 1000,
    })

    if (!verificationLimit.allowed) {
      return NextResponse.json(
        {
          message: `Too many verification attempts. Try again in ${verificationLimit.retryAfterSeconds} seconds.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(verificationLimit.retryAfterSeconds),
          },
        }
      )
    }

    const eduEmailValidationResult = await verifyEduEmail(normalizedEduEmail, schoolName)
    if (!eduEmailValidationResult.ok) {
      return NextResponse.json(
        { message: eduEmailValidationResult.message },
        { status: eduEmailValidationResult.status }
      )
    }

    if (!eduEmailValidationResult.isValidEduEmail) {
      return NextResponse.json(
        { message: INVALID_EDU_EMAIL_MESSAGE },
        { status: 400 }
      )
    }

    // const user = await prisma.user.findUnique({
    //   where: { email: normalizedEmail },
    // })

    // // Keep response generic to avoid email enumeration.
    // if (!user) {
    //   return NextResponse.json(
    //     { message: 'If this email exists, a verification link will be sent.' },
    //     { status: 200 }
    //   )
    // }

    const verificationToken = await createToken(sessionEmail, {
      pendingEduEmail: normalizedEduEmail,
    })
    if (!verificationToken) {
      return NextResponse.json(
        { message: 'Could not create verification token.' },
        { status: 500 }
      )
    }

    await sendVerificationEmail({
      firstName: sessionName || schoolName,
      to: normalizedEduEmail,
      token: verificationToken.token,
      type: 'studentVerification',
    })

    return NextResponse.json(
      { message: 'If this email exists, a verification link will be sent.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error sending student verification email:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
