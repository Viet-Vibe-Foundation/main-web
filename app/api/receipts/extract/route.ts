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

function buildPrompt(imageUrl: string) {
  const currentYear = new Date().getFullYear()
  return `Extract receipt data from this image and return ONLY valid JSON in this exact format:
{"receipt":{"receiptNumber":"","receiptDate":"YYYY-MM-DDTHH:mm:ssZ","merchantName":"","merchantAddress":"","currency":"CAD","subtotal":0,"taxAmount":0,"tipAmount":0,"discountAmount":0,"totalAmount":0,"note":"","paymentMethod":"Other","paymentReference":"","category":"Other","receiptImageUrl":"","rawText":"","items":[{"description":"","quantity":1,"unitPrice":0,"taxAmount":0,"discount":0,"lineTotal":0}]}}

Rules:
- Match fields to Prisma schema models Receipt and ReceiptItem.
- Allowed paymentMethod: Cash, Card, BankTransfer, EWallet, Cheque, Other.
- Allowed category: Food, Transportation, Shopping, Utilities, Housing, Health, Education, Entertainment, Travel, Insurance, Salary, Tax, Office, Subscription, Gift, Other.
- If receiptDate has no year, infer year as ${currentYear} unless context clearly indicates another year.
- Use ISO 8601 for receiptDate.
- If unknown text field, use empty string.
- If unknown numeric field, use 0.
- Ensure items is always an array (use [] if no line items found).
- Set receiptImageUrl to "${imageUrl}".
- rawText should contain OCR text from the receipt (best effort).
- Do not include markdown.
- Do not include explanation.`
}

async function call9Router({
  apiKey,
  prompt,
  imageUrl,
}: {
  apiKey: string
  prompt: string
  imageUrl: string
}) {
  return fetch(ROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      temperature: 0,
      stream: false,
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = (await req.json()) as { imageUrl?: string }

    if (!imageUrl) {
      console.error('imageUrl is required')
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    }

    const routerApiKey = process.env.NINE_ROUTER_API_KEY
    if (!routerApiKey) {
      console.error('9ROUTER_API_KEY is missing')
      return NextResponse.json({ error: '9ROUTER_API_KEY is missing' }, { status: 500 })
    }

    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image from imageUrl' },
        { status: 400 },
      )
    }

    const prompt = buildPrompt(imageUrl)

    const routerResponse = await call9Router({
      apiKey: routerApiKey,
      prompt,
      imageUrl,
    })

    if (!routerResponse.ok) {
      const errorText = await routerResponse.text()
      console.error('9router request failed', errorText)
      return NextResponse.json(
        { error: '9router request failed', details: errorText },
        { status: 502 },
      )
    }

    const routerData = (await routerResponse.json()) as RouterChatCompletionResponse
    const rawContent = routerData.choices?.[0]?.message?.content
    const modelText =
      typeof rawContent === 'string'
        ? rawContent
        : rawContent?.find((part) => part.type === 'text')?.text

    if (!modelText) {
      console.error('9router returned empty content', routerData)
      return NextResponse.json(
        { error: '9router returned empty content', raw: routerData },
        { status: 502 },
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(modelText)
    } catch {
      console.error('9router output is not valid JSON', modelText)
      return NextResponse.json(
        { error: '9router output is not valid JSON', raw: modelText },
        { status: 502 },
      )
    }

    return NextResponse.json(parsed, { status: 200 })
  } catch (error) {
    if (error instanceof Error) {
      console.error('Receipt extraction error:', error.stack)
    } else {
      console.error('Receipt extraction error:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

