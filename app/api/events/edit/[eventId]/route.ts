import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { revalidateTag } from 'next/cache'
import { canAccessEventPaymentData } from '@/lib/actions/payment/canAccessEventPaymentData'

export const PUT = async (
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) => {
  try {
    const session = await auth()
    if (!session?.user?.role?.includes('ADMIN') && !session?.user?.role?.includes('HOST') && !session?.user?.role?.includes('SUPERADMIN')) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // Extract the data from the request
    const { isPublished, ...values } = await request.json()
    const { eventId } = await params

    // Hosts may only edit events they host (admins can edit any event)
    if (!(await canAccessEventPaymentData(eventId))) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    console.log(isPublished)
    // Check if the event exists
    const eventExists = await prisma.event.findUnique({
      where: {
        id: eventId,
      },
    })

    if (!eventExists) {
      return new NextResponse('Event not found', { status: 404 })
    }

    // TODO: Do we need to assign to eventExists.days?
    const eventDays = (eventExists.days = values.days)

    // Update the event
    let updatedEvent
    if (values.days) {
      updatedEvent = await prisma.event.update({
        where: {
          id: eventId,
        },
        data: {
          days: eventDays,
        },
      })
    } else {
      updatedEvent = await prisma.event.update({
        where: {
          id: eventId,
        },
        data: {
          ...values,
        },
      })
    }

    // Revalidate events cache
    revalidateTag('events')

    return NextResponse.json(updatedEvent)
  } catch (error) {
    console.log('[EDIT EVENT ERROR]', error)
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Duplicate entry
        return new NextResponse('There is already an event with the same title or keyName.', { status: 409 })
      }
    }     
    return new NextResponse('Internal server error', { status: 500 })
  }
}
